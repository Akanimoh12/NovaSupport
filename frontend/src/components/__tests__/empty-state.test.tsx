import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "../empty-state";

describe("EmptyState", () => {
  it("renders default variant", () => {
    const { container } = render(
      <EmptyState title="No data" description="There is no data to display" />
    );
    expect(container).toMatchSnapshot();
  });

  it("renders supporters variant", () => {
    const { container } = render(
      <EmptyState
        variant="supporters"
        title="Be the first to support!"
        description="This profile hasn't received support yet."
      />
    );
    expect(container).toMatchSnapshot();
  });

  it("renders transactions variant", () => {
    const { container } = render(
      <EmptyState
        variant="transactions"
        title="No transactions yet"
        description="Transactions will appear here once supporters send funds."
      />
    );
    expect(container).toMatchSnapshot();
  });

  it("renders explore variant", () => {
    const { container } = render(
      <EmptyState
        variant="explore"
        title="No creators found"
        description="Try adjusting your search or check back later."
      />
    );
    expect(container).toMatchSnapshot();
  });

  it("renders with action button", () => {
    const mockClick = vi.fn();
    const { container } = render(
      <EmptyState
        title="No results"
        description="Try adjusting your search"
        action={{ label: "Clear Search", onClick: mockClick }}
      />
    );
    expect(container).toMatchSnapshot();
  });
});
