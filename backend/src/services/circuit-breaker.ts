import { logger } from "../logger.js";
import { Metrics } from "../metrics.js";

type State = "CLOSED" | "OPEN" | "HALF_OPEN";

export class CircuitBreaker {
  private state: State = "CLOSED";
  private failureThreshold: number;
  private resetTimeout: number;
  private failureCount: number = 0;
  private nextAttempt: number = 0;

  constructor(failureThreshold = 5, resetTimeout = 30000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    Metrics.circuitBreakerState("CLOSED");
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() >= this.nextAttempt) {
        this.state = "HALF_OPEN";
        Metrics.circuitBreakerState("HALF_OPEN");
        logger.info("Circuit breaker state: HALF_OPEN");
      } else {
        throw new Error("Circuit breaker is OPEN");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      Metrics.circuitBreakerState("CLOSED");
      logger.info("Circuit breaker state: CLOSED");
    }
  }

  private onFailure() {
    this.failureCount++;
    if (this.state === "HALF_OPEN" || this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextAttempt = Date.now() + this.resetTimeout;
      Metrics.circuitBreakerState("OPEN");
      logger.warn(
        { failureCount: this.failureCount, nextAttempt: new Date(this.nextAttempt).toISOString() },
        "Circuit breaker state: OPEN"
      );
    }
  }

  getState(): State {
    return this.state;
  }
}
