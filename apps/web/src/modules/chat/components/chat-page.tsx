// 聊天页：左侧会话列表 + 模型选择，右侧消息流 + 输入区。
// useChat（@tanstack/ai-react）经 fetchServerSentEvents 接到
// POST /api/llm/chats/:id/messages（AG-UI SSE 流）；历史经
// GET /api/llm/chats/:id/messages 拉取后映射为 UIMessage[] 注入 setMessages。

import { Button } from "@openstarter/ui-web/components/button";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@openstarter/ui-web/components/select";
import { Textarea } from "@openstarter/ui-web/components/textarea";

import { ai, type AiModelView } from "@/modules/ai/lib/api";
import {
  chatKeys,
  fetchHistoryPage,
  flattenHistoryPages,
  getNextHistoryPage,
} from "@/modules/chat/lib/api";

import { toUiMessage } from "../lib/messages";
import { ChatMessages } from "./chat-messages";

type ChatRow = {
  id: string;
  title: string;
  updatedAt?: string;
};

const modelKey = (model: { provider: string; modelId: string }): string =>
  `${model.provider}:${model.modelId}`;

/**
 * 402/502 消息透出（final-review I2）：@tanstack/ai-client 的 assertResponseOk
 * 只抛 `HTTP error! status: <code>`（仅 401 读 body），迁移前
 * DefaultChatTransport 透出的是 `response.text()`。在 fetchClient 层先于它读取
 * 响应正文并抛出；正文为空时退回 status 文案。
 */
const fetchClientWithBodyError: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.ok) return response;
  const body = (await response.clone().text()).trim();
  throw new Error(body.length > 0 ? body : `HTTP error! status: ${response.status}`);
};

/**
 * 流错误对外展示的消息：fetchClient 抛出的错误会被 fetchEventSource 包进
 * StreamReadError（message 固定为 "Stream response body read failed"，原始
 * 错误挂在 cause 上）。沿 cause 链取最内层消息，恢复响应正文
 * （如 "insufficient credits"），否则保持原消息。
 */
export const surfaceErrorMessage = (error: unknown): string => {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && current.cause instanceof Error && !seen.has(current)) {
    seen.add(current);
    current = current.cause;
  }
  if (current instanceof Error && current.message.length > 0) return current.message;
  return error instanceof Error && error.message.length > 0 ? error.message : "Unknown error";
};

/** 模型选择器的可选项：text 分组 + `${provider}:${modelId}` 键。 */
const selectorItems = (models: AiModelView[]) =>
  models.map((model) => ({ key: modelKey(model), label: model.displayName }));

export function ChatPage() {
  const modelsQuery = useQuery({ ...ai.queries.models() });
  const chatsQuery = useQuery({ ...ai.queries.chats(1) });

  const createChat = useMutation({ ...ai.mutations.createChat() });
  const deleteChat = useMutation({ ...ai.mutations.deleteChat() });

  const textModels: AiModelView[] = modelsQuery.data?.text ?? [];
  const modelOptions = selectorItems(textModels);

  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // 默认选中 text 分组的第一个模型；用户显式选择后以选择为准。
  const activeModelKey = selectedModelKey ?? modelOptions.at(0)?.key ?? "";

  const handleModelChange = (key: string) => {
    setSelectedModelKey(key);
  };

  // 模型键解析：modelId 本身可能含 ":"（openrouter 风格），只在首个 ":" 处
  // 切分 provider 与 modelId（final-review MINOR-6）。
  const parseModelKey = (key: string): { modelId: string; provider: string } | null => {
    const index = key.indexOf(":");
    if (index <= 0 || index === key.length - 1) {
      return null;
    }
    return { provider: key.slice(0, index), modelId: key.slice(index + 1) };
  };

  const handleNewChat = async () => {
    const parsed = parseModelKey(activeModelKey);
    try {
      const created = await createChat.mutateAsync(
        parsed ? { provider: parsed.provider, model: parsed.modelId } : {},
      );
      // RPC 信封 data 未携带精确类型，边界处校验后再使用。
      const newChatId = created?.id;
      if (typeof newChatId !== "string") {
        throw new Error("Failed to create chat");
      }
      setActiveChatId(newChatId);
      toast.success("New chat created");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleDeleteChat = async (id: string) => {
    try {
      await deleteChat.mutateAsync({ id });
      if (activeChatId === id) {
        setActiveChatId(null);
      }
      toast.success("Chat deleted");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const chats = (chatsQuery.data?.items ?? []) as ChatRow[];

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full gap-6">
      <aside className="flex w-64 shrink-0 flex-col gap-3">
        <Select onValueChange={handleModelChange} value={activeModelKey}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a model..." />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button disabled={createChat.isPending} onClick={() => void handleNewChat()} type="button">
          New chat
        </Button>

        <div className="flex-1 divide-y overflow-y-auto rounded-lg border">
          {chats.map((chat) => (
            <div className="flex items-center justify-between gap-1 px-3 py-2" key={chat.id}>
              <button
                className="min-w-0 flex-1 text-left hover:bg-muted/60"
                onClick={() => setActiveChatId(chat.id)}
                type="button"
              >
                <span className="block truncate font-medium text-sm">
                  {chat.title || "Untitled"}
                </span>
              </button>
              <Button
                aria-label={`Delete ${chat.title || "Untitled"}`}
                disabled={deleteChat.isPending}
                onClick={() => void handleDeleteChat(chat.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Delete
              </Button>
            </div>
          ))}
          {chatsQuery.isPending ? (
            <p className="p-3 text-muted-foreground text-sm">Loading chats...</p>
          ) : null}
          {!chatsQuery.isPending && chats.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">No chats yet.</p>
          ) : null}
        </div>
      </aside>

      {/* key=chatId：会话切换必须让 ChatSurface 整体重挂载 —— 内部 wasLoadingRef /
          错误态等 hook 依赖 chatId，不重挂会把流结束失效算到新会话头上。 */}
      {activeChatId === null ? (
        <section className="flex flex-1 items-center justify-center rounded-lg border">
          <p className="text-muted-foreground text-sm">
            Select a conversation or start a new chat.
          </p>
        </section>
      ) : (
        <ChatSurface
          chatId={activeChatId}
          draft={draft}
          key={activeChatId}
          onDraftChange={setDraft}
        />
      )}
    </div>
  );
}

/** 历史查询 key（与 chatQueries.history 一致）：流式结束后按前缀失效所有页。 */
const historyKey = chatKeys.history;

function ChatSurface({
  chatId,
  draft,
  onDraftChange,
}: {
  chatId: string;
  draft: string;
  onDraftChange: (value: string) => void;
}) {
  const queryClient = useQueryClient();
  const { messages, sendMessage, isLoading, error, setMessages, stop } = useChat({
    threadId: chatId,
    connection: fetchServerSentEvents(`/api/llm/chats/${chatId}/messages`, {
      fetchClient: fetchClientWithBodyError,
    }),
    onError: (streamError: Error) => toast.error(surfaceErrorMessage(streamError)),
    onFinish: () => {
      void queryClient.invalidateQueries({ queryKey: historyKey(chatId) });
    },
  });

  // abort 时 onFinish 可能不触发：isLoading 由 true 转 false 也失效历史缓存
  // （迁移前 onFinish 含 abort 语义，见原注释 final-review MEDIUM-2）。
  const wasLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      void queryClient.invalidateQueries({ queryKey: historyKey(chatId) });
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, chatId, queryClient]);

  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [error]);

  // 分页历史（inf-page-params）：page 1 = 最新一页，向后翻页取更早消息，
  // 长会话不再被单页上限静默截断。
  const historyQuery = useInfiniteQuery({
    getNextPageParam: getNextHistoryPage,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchHistoryPage(chatId, pageParam),
    queryKey: historyKey(chatId),
  });

  useEffect(() => {
    if (historyQuery.data) {
      setMessages(flattenHistoryPages(historyQuery.data.pages).map(toUiMessage));
    }
  }, [historyQuery.data, setMessages]);

  const isStreaming = isLoading;

  const handleSubmit = () => {
    const text = draft.trim();
    if (text.length === 0 || isStreaming) {
      return;
    }
    void sendMessage(text);
    onDraftChange("");
  };

  return (
    <section className="flex flex-1 flex-col gap-3 rounded-lg border p-4" key={chatId}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 长会话不再静默截断：仍有更早消息时提供显式入口（inf-loading-guards：
            fetchNextPage 前判 hasNextPage 与 isFetchingNextPage）。 */}
        {historyQuery.hasNextPage ? (
          <div className="flex justify-center pb-2">
            <Button
              disabled={historyQuery.isFetchingNextPage}
              onClick={() => void historyQuery.fetchNextPage()}
              size="sm"
              type="button"
              variant="outline"
            >
              {historyQuery.isFetchingNextPage ? "Loading..." : "Load earlier messages"}
            </Button>
          </div>
        ) : null}
        <ChatMessages messages={messages} />
      </div>

      {error && !errorDismissed ? (
        <div
          className="flex items-center justify-between gap-2 rounded-lg border border-destructive bg-card px-4 py-3 text-destructive text-sm"
          role="alert"
        >
          <span>{surfaceErrorMessage(error)}</span>
          <Button onClick={() => setErrorDismissed(true)} size="sm" type="button" variant="ghost">
            Dismiss
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          disabled={isStreaming}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
          placeholder="Type a message..."
          rows={2}
          value={draft}
        />
        {isStreaming ? (
          <Button onClick={() => void stop()} type="button" variant="outline">
            Stop
          </Button>
        ) : (
          <Button disabled={draft.trim().length === 0} onClick={handleSubmit} type="button">
            Send
          </Button>
        )}
      </div>
    </section>
  );
}
