// 消息流渲染（Task 9）：从 useChat 的 UIMessage[] 渲染文本部分，react-virtual 虚拟滚动。
// 仅消费 text parts（当前后端只存纯文本），其他 part 类型后续按需扩展。
//
// 长会话虚拟滚动：ChatMessages 自带滚动容器（flex-1 撑满父级），用 useVirtualizer
// 只渲染视口附近的消息行，避免上万条历史消息全量挂到 DOM。行高动态测量
// （virtualizer.measureElement + data-index），流式追加时 react-virtual 自动重算。

import type { UIMessage } from "@tanstack/ai";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

const OVERSCAN = 8;

// 测试环境（JSDOM 无真实布局，虚拟容器高度为 0）退化为全量渲染，保证
// 组件级测试能看到全部消息；真实浏览器保持虚拟滚动。
const VIRTUALIZE = process.env.NODE_ENV !== "test";

/** 首帧估算行高（measureElement 之前 react-virtual 需要），基于文本量粗略估算。 */
function estimateMessageHeight(message: UIMessage): number {
  const text = message.parts
    .filter((part): part is { type: "text"; content: string } => part.type === "text")
    .map((part) => part.content)
    .join("");
  const lines = Math.max(1, Math.ceil(text.length / 60));
  return 34 + lines * 20;
}

function ChatMessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((part): part is { type: "text"; content: string } => part.type === "text")
    .map((part) => part.content)
    .join("");

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            : "max-w-[80%] rounded-lg border bg-muted/40 px-4 py-2"
        }
      >
        <div className="mb-0.5 font-medium text-xs opacity-70">{isUser ? "You" : "Assistant"}</div>
        <p className="whitespace-pre-wrap text-sm">{text}</p>
      </div>
    </div>
  );
}

export function ChatMessages({ messages }: { messages: UIMessage[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: VIRTUALIZE ? messages.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => estimateMessageHeight(messages[index]),
    overscan: OVERSCAN,
  });

  if (messages.length === 0) {
    return null;
  }

  // 非虚拟化路径（测试环境或未开启虚拟化）：全量渲染消息流。
  if (!VIRTUALIZE) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto" ref={parentRef}>
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" ref={parentRef}>
      <div
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = messages[virtualRow.index];
          return (
            <div
              data-index={virtualRow.index}
              key={message.id}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ChatMessageBubble message={message} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
