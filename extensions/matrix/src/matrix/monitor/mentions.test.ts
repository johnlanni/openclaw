import { describe, expect, it } from "vitest";
import { stripMatrixMentionForCommand } from "./mentions.js";

describe("stripMatrixMentionForCommand", () => {
  const selfUserId = "@openclaw:example.org";
  const mentionRegexes = [/\bopenclaw\b/i, /\bOpenClawBot\b/i];

  it("strips @user:server at start", () => {
    expect(
      stripMatrixMentionForCommand("@openclaw:example.org /new", selfUserId, mentionRegexes),
    ).toBe("/new");
    expect(
      stripMatrixMentionForCommand("@openclaw:example.org  /reset", selfUserId, mentionRegexes),
    ).toBe("/reset");
  });

  it("strips display name from mentionRegexes at start", () => {
    expect(stripMatrixMentionForCommand("OpenClawBot /new", selfUserId, mentionRegexes)).toBe(
      "/new",
    );
    expect(stripMatrixMentionForCommand("openclaw /model", selfUserId, mentionRegexes)).toBe(
      "/model",
    );
  });

  it("returns unchanged when no leading mention", () => {
    expect(stripMatrixMentionForCommand("/new", selfUserId, mentionRegexes)).toBe("/new");
    expect(stripMatrixMentionForCommand("hello world", selfUserId, mentionRegexes)).toBe(
      "hello world",
    );
  });

  it("handles null selfUserId", () => {
    expect(stripMatrixMentionForCommand("OpenClawBot /new", null, mentionRegexes)).toBe("/new");
    expect(stripMatrixMentionForCommand("@openclaw:example.org /new", null, [])).toBe(
      "@openclaw:example.org /new",
    );
  });

  it("handles empty mentionRegexes", () => {
    expect(stripMatrixMentionForCommand("@openclaw:example.org /new", selfUserId, [])).toBe("/new");
  });
});
