import { logger } from "../logger.js";
import { Metrics } from "../metrics.js";

export type State = "CLOSED" | "OPEN" | "HALF_OPEN";

export type CircuitBreakerSnapshot = {
  state: State;
  failureCount: number;
  nextAttempt: number;
};

export type CircuitBreakerStorage = {
  load(): Promise<CircuitBreakerSnapshot | null>;
  save(snapshot: CircuitBreakerSnapshot): Promise<void>;
};

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failureThreshold: number;
  private resetTimeout: number;
  private failureCount: number = 0;
  private nextAttempt: number = 0;
  private readonly storage: CircuitBreakerStorage | null;
  private initialized: Promise<void> | null = null;

  constructor(
    failureThreshold = 5,
    resetTimeout = 30000,
    storage: CircuitBreakerStorage | null = null,
  ) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.storage = storage;
    Metrics.circuitBreakerState("CLOSED");
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureInitialized();

    if (this.state === "OPEN") {
      if (Date.now() >= this.nextAttempt) {
        await this.setState("HALF_OPEN");
        Metrics.circuitBreakerState("HALF_OPEN");
        logger.info("Circuit breaker state: HALF_OPEN");
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async onSuccess() {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      await this.setState("CLOSED");
      Metrics.circuitBreakerState("CLOSED");
      logger.info("Circuit breaker state: CLOSED");
    } else {
      await this.persist();
    }
  }

  private async onFailure() {
    this.failureCount++;
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.nextAttempt = Date.now() + this.resetTimeout;
      await this.setState("OPEN");
      Metrics.circuitBreakerState("OPEN");
      logger.warn(
        { failureCount: this.failureCount, nextAttempt: new Date(this.nextAttempt).toISOString() },
        "Circuit breaker state: OPEN"
      );
    } else {
      await this.persist();
    }
  }

  getState(): State {
    return this.state;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.storage) return;
    this.initialized ??= this.storage.load()
      .then(async (snapshot) => {
        if (!snapshot) {
          await this.persist();
          return;
        }
        this.state = snapshot.state;
        this.failureCount = snapshot.failureCount;
        this.nextAttempt = snapshot.nextAttempt;

        if (this.state === "OPEN" && Date.now() >= this.nextAttempt) {
          this.state = "HALF_OPEN";
          await this.persist();
        }

        Metrics.circuitBreakerState(this.state);
        logger.info(
          {
            state: this.state,
            failureCount: this.failureCount,
            nextAttempt: this.nextAttempt ? new Date(this.nextAttempt).toISOString() : null,
          },
          "Circuit breaker state restored",
        );
      })
      .catch((err) => {
        logger.error({ err }, "Failed to restore circuit breaker state");
      });
    await this.initialized;
  }

  private async setState(state: State): Promise<void> {
    this.state = state;
    if (state === "CLOSED") {
      this.nextAttempt = 0;
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.storage) return;
    await this.storage.save({
      state: this.state,
      failureCount: this.failureCount,
      nextAttempt: this.nextAttempt,
    });
  }
}
