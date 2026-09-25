/**
 * 历史 API 行（纯文本 content）→ TanStack UIMessage。
 * TanStack TextPart 为 { type: "text", content }（Vercel AI SDK 是 text 字段）。
 */

import type { UIMessage } from "@tanstack/ai";

export const toUiMessage = (row: { id: string; role: string; content: string }): UIMessage => ({
  id: row.id,
  role: row.role === "assistant" ? "assistant" : "user",
  parts: [{ type: "text", content: row.content }],
});
