/**
 * AG-UI sendMessage 请求体解析（TanStack AI useChat 经 fetchServerSentEvents
 * POST 的 wire 格式）。服务端不信任客户端 transcript：上下文一律以 DB 历史
 * 为准，仅提取「最新一条 user 消息」的纯文本用于落库与本轮输入。
 */

import { z } from "zod";

const textPartSchema = z.object({ type: z.literal("text"), content: z.string() });

export const sendMessageBody = z.object({
  threadId: z.string().optional(),
  runId: z.string().optional(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.enum(["user", "assistant", "system"]),
        parts: z.array(z.unknown()).min(1),
      }),
    )
    .min(1),
  forwardedProps: z.record(z.string(), z.unknown()).optional(),
});

export type SendMessageBody = z.infer<typeof sendMessageBody>;

/** 最后一条 user 消息的 text part 拼接（trim 后）；不存在可发文本时返回 null。 */
export function extractLatestUserText(body: SendMessageBody): string | null {
  for (let i = body.messages.length - 1; i >= 0; i -= 1) {
    const message = body.messages[i];
    if (message == null || message.role !== "user") continue;
    const text = message.parts
      .flatMap((part) => {
        const parsed = textPartSchema.safeParse(part);
        return parsed.success ? [parsed.data.content] : [];
      })
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}
