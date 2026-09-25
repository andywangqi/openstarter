import { describe, expect, it } from "vitest";

import { toUiMessage } from "./messages";

describe("toUiMessage", () => {
  it("历史行 → TanStack UIMessage（text part 用 content 字段）", () => {
    expect(toUiMessage({ id: "m1", role: "assistant", content: "你好" })).toEqual({
      id: "m1",
      role: "assistant",
      parts: [{ type: "text", content: "你好" }],
    });
  });

  it("未知 role 归为 user", () => {
    expect(toUiMessage({ id: "m2", role: "system", content: "x" }).role).toBe("user");
  });
});
