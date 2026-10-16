import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { generateSuggestions } from "./username-validator.js";

test("generated username suggestions stay within the 32-character limit", () => {
  const suggestions = generateSuggestions("a".repeat(32));
  assert.ok(suggestions.length > 0);
  assert.ok(
    suggestions.every((suggestion) => suggestion.length <= 32),
    suggestions.join(", "),
  );
  assert.match(suggestions[0], /^a+-\d{1,4}$/);
});

test("first username suggestion is length guarded even with the largest numeric suffix", () => {
  const random = mock.method(Math, "random", () => 0.9999);

  try {
    const [firstSuggestion] = generateSuggestions("b".repeat(32));
    assert.equal(firstSuggestion.length, 32);
    assert.equal(firstSuggestion.endsWith("-9999"), true);
  } finally {
    random.mock.restore();
  }
});
