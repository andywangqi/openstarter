// ChatPage 组件测试（Task 9）：mock useChat（@tanstack/ai-react）与 ai 查询工厂，
// 覆盖消息渲染/历史加载、模型选择、发送、流式停止、错误态与会话管理。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom 未实现 scrollIntoView；Radix Select 打开时会对选中项调用它。
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom 未实现 PointerEvent（jsdom ≤ 29）；Radix Select 用 PointerEvent 判定指针类型。
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventPolyfill extends MouseEvent {
      public pointerId: number;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 0;
      }
    }
    (window as { PointerEvent?: typeof PointerEvent }).PointerEvent =
      PointerEventPolyfill as unknown as typeof PointerEvent;
  }
});

const useChatState = vi.hoisted(() => ({
  current: {
    messages: [] as Array<{
      id: string;
      role: "user" | "assistant";
      parts: Array<{ type: "text"; content: string }>;
    }>,
    sendMessage: vi.fn(),
    isLoading: false,
    error: undefined as Error | undefined,
    setMessages: vi.fn(),
    stop: vi.fn(),
    onFinish: undefined as ((event: unknown) => void) | undefined,
    onError: undefined as ((error: Error) => void) | undefined,
  },
}));

// fetchServerSentEvents 的第二个参数（FetchConnectionOptions，含 fetchClient）。
const connectionOptions = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}));

const chatsState = vi.hoisted(() => ({
  items: [] as Array<{ id: string; title: string; updatedAt: string }>,
  total: 0,
}));

const modelsState = vi.hoisted(() => ({
  catalog: {} as Record<string, Array<Record<string, unknown>>>,
}));

const aiMocks = vi.hoisted(() => ({
  createChat: vi.fn(),
  deleteChat: vi.fn(),
}));

const messagesGetMock = vi.hoisted(() => vi.fn());

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock("@tanstack/ai-react", () => ({
  // 捕获组件传入的 onFinish / onError（useChat options），供流结束失效缓存与
  // 错误透出的断言使用。
  useChat: (options?: {
    onFinish?: (event: unknown) => void;
    onError?: (error: Error) => void;
  }) => {
    useChatState.current.onFinish = options?.onFinish;
    useChatState.current.onError = options?.onError;
    return useChatState.current;
  },
  // 连接适配器由 hook 消费；组件测试关心端点路径与传入的连接选项（fetchClient）。
  fetchServerSentEvents: vi.fn((path: string, options?: Record<string, unknown>) => {
    connectionOptions.current = options;
    return path;
  }),
}));

vi.mock("@/modules/ai/lib/api", () => ({
  ai: {
    queries: {
      models: () => ({
        queryKey: ["ai", "models"],
        queryFn: async () => modelsState.catalog,
      }),
      chats: (page: number) => ({
        queryKey: ["ai", "chats", page],
        queryFn: async () => ({ items: chatsState.items, total: chatsState.total }),
      }),
    },
    mutations: {
      // 组件把工厂返回值展开进 useMutation：mock 必须提供真正的 mutationFn，
      // 让 TanStack 的 result.mutateAsync 调到 mock（仅给 mutateAsync 选项会被
      // TanStack 忽略，调用因缺失 mutationFn 直接 reject）。
      createChat: () => ({ mutationFn: aiMocks.createChat }),
      deleteChat: () => ({ mutationFn: aiMocks.deleteChat }),
    },
  },
}));

vi.mock("@/lib/api", () => ({
  client: {
    api: {
      llm: {
        chats: {
          [":id"]: {
            messages: { $get: messagesGetMock },
          },
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: toastMocks }));

import { ChatPage } from "./chat-page";

const chatRow = (overrides: { id: string; title: string }) => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  id: overrides.id,
  model: "gpt-4o",
  provider: "openai",
  status: "active",
  title: overrides.title,
  updatedAt: "2026-01-02T00:00:00.000Z",
  userId: "user-1",
});

const messageRow = (overrides: { id: string; role: "user" | "assistant"; content: string }) => ({
  chatId: "chat-1",
  content: overrides.content,
  createdAt: "2026-01-01T00:00:00.000Z",
  id: overrides.id,
  model: "gpt-4o",
  provider: "openai",
  role: overrides.role,
  status: "success",
  updatedAt: "2026-01-01T00:01:00.000Z",
  userId: "user-1",
});

const textModel = (overrides: {
  displayName: string;
  id: string;
  modelId: string;
  provider: string;
}) => ({
  creditPrice: 1,
  displayName: overrides.displayName,
  id: overrides.id,
  maxOutputTokens: null,
  mediaType: "text",
  modelId: overrides.modelId,
  optionsSchema: null,
  provider: overrides.provider,
});

const renderChatPage = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ChatPage />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  useChatState.current = {
    messages: [],
    sendMessage: vi.fn(),
    isLoading: false,
    error: undefined,
    setMessages: vi.fn(),
    stop: vi.fn(),
    onFinish: undefined,
    onError: undefined,
  };
  connectionOptions.current = undefined;
  chatsState.items = [
    chatRow({ id: "chat-1", title: "Trip planning" }),
    chatRow({ id: "chat-2", title: "Refactor ideas" }),
  ];
  chatsState.total = 2;
  modelsState.catalog = {
    image: [
      textModel({ displayName: "Flux Dev", id: "model-3", modelId: "flux-dev", provider: "fal" }),
    ],
    text: [
      textModel({ displayName: "GPT-4o", id: "model-1", modelId: "gpt-4o", provider: "openai" }),
      textModel({
        displayName: "Claude Sonnet 4.5",
        id: "model-2",
        modelId: "claude-sonnet-4-5",
        provider: "anthropic",
      }),
    ],
  };
  aiMocks.createChat.mockReset();
  aiMocks.deleteChat.mockReset();
  messagesGetMock.mockReset();
  messagesGetMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      code: 0,
      data: {
        items: [
          messageRow({ content: "Plan a trip to Kyoto", id: "msg-1", role: "user" }),
          messageRow({ content: "Here is a day-by-day plan.", id: "msg-2", role: "assistant" }),
        ],
        total: 2,
      },
      message: "ok",
    }),
  });
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
});

describe("ChatPage", () => {
  it("renders message text of the active conversation", async () => {
    useChatState.current.messages = [
      { id: "m1", parts: [{ content: "Plan a trip to Kyoto", type: "text" }], role: "user" },
      { id: "m2", parts: [{ content: "Here is a plan.", type: "text" }], role: "assistant" },
    ];

    renderChatPage();

    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    expect(await screen.findByText("Here is a plan.")).toBeTruthy();
    expect(screen.getByText("Plan a trip to Kyoto")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.getByText("Assistant")).toBeTruthy();
  });

  it("loads history rows as UI messages for the selected chat", async () => {
    renderChatPage();

    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    await waitFor(() => {
      expect(messagesGetMock).toHaveBeenCalledWith({
        param: { id: "chat-1" },
        query: { page: "1", pageSize: "100" },
      });
    });
    await waitFor(() => {
      expect(useChatState.current.setMessages).toHaveBeenCalledWith([
        { id: "msg-1", parts: [{ content: "Plan a trip to Kyoto", type: "text" }], role: "user" },
        {
          id: "msg-2",
          parts: [{ content: "Here is a day-by-day plan.", type: "text" }],
          role: "assistant",
        },
      ]);
    });
  });

  it("loads earlier messages past the first history page", async () => {
    // 后端按倒序分页：page 1 = 最新一页。这里 total=3、每页 2 条 → 存在更早的一页。
    messagesGetMock.mockImplementation(async ({ query }) => {
      const page = Number(query.page);
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data:
            page === 1
              ? {
                  items: [
                    messageRow({ content: "newer-1", id: "msg-2", role: "user" }),
                    messageRow({ content: "newer-2", id: "msg-3", role: "assistant" }),
                  ],
                  total: 3,
                }
              : {
                  items: [messageRow({ content: "oldest", id: "msg-1", role: "user" })],
                  total: 3,
                },
          message: "ok",
        }),
      };
    });

    renderChatPage();
    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    const loadOlder = await screen.findByRole("button", { name: "Load earlier messages" });
    fireEvent.click(loadOlder);

    await waitFor(() => {
      expect(messagesGetMock).toHaveBeenCalledWith({
        param: { id: "chat-1" },
        query: { page: "2", pageSize: "100" },
      });
    });
    // 更早的消息拼接在列表最前（pages 新→旧，展平时反转为时间正序）。
    await waitFor(() => {
      expect(useChatState.current.setMessages).toHaveBeenCalledWith([
        { id: "msg-1", parts: [{ content: "oldest", type: "text" }], role: "user" },
        { id: "msg-2", parts: [{ content: "newer-1", type: "text" }], role: "user" },
        { id: "msg-3", parts: [{ content: "newer-2", type: "text" }], role: "assistant" },
      ]);
    });
  });

  it("does not offer to load earlier messages when everything is already loaded", async () => {
    renderChatPage();
    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    // beforeEach 桩：items=2 / total=2 → 已加载完整，不出现按钮。
    await waitFor(() => {
      expect(messagesGetMock).toHaveBeenCalledWith({
        param: { id: "chat-1" },
        query: { page: "1", pageSize: "100" },
      });
    });
    expect(screen.queryByRole("button", { name: "Load earlier messages" })).toBeNull();
  });

  it("invalidates the chat history query when the stream finishes", async () => {
    renderChatPage();

    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    // 等历史查询与 onFinish 接线就绪。
    await waitFor(() => {
      expect(messagesGetMock).toHaveBeenCalledWith({
        param: { id: "chat-1" },
        query: { page: "1", pageSize: "100" },
      });
    });
    const onFinish = useChatState.current.onFinish;
    if (!onFinish) {
      throw new Error("useChat onFinish not wired");
    }

    messagesGetMock.mockClear();
    // 流结束 → 历史缓存失效 → 查询重新拉取（staleTime 60s 不再遮蔽新消息）。
    onFinish({ message: {}, messages: [], isAbort: false, isDisconnect: false, isError: false });

    await waitFor(() => {
      expect(messagesGetMock).toHaveBeenCalledWith({
        param: { id: "chat-1" },
        query: { page: "1", pageSize: "100" },
      });
    });
  });

  it("lists text media models in the selector and defaults to the first one", async () => {
    renderChatPage();

    // Radix Select 只有在打开后渲染 SelectItem；模型目录是异步查询，
    // 先等数据到位、触发器显示默认模型，再断言并展开选项。
    const trigger = await screen.findByRole("combobox");
    await waitFor(() => expect(trigger.textContent).toContain("GPT-4o"));
    expect((trigger as HTMLButtonElement).dataset.state).toBe("closed");

    fireEvent.click(trigger);

    expect(await screen.findByRole("option", { name: "Claude Sonnet 4.5" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "GPT-4o" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Flux Dev" })).toBeNull();
  });

  it("sends the typed message on submit", async () => {
    renderChatPage();

    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    const input = await screen.findByRole("textbox");
    fireEvent.change(input, { target: { value: "Hello there" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(useChatState.current.sendMessage).toHaveBeenCalledWith("Hello there");
    });
  });

  it("disables the input and stops the stream while streaming", async () => {
    useChatState.current = { ...useChatState.current, isLoading: true };

    renderChatPage();

    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    const input = await screen.findByRole("textbox");
    expect((input as HTMLTextAreaElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Send" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(useChatState.current.stop).toHaveBeenCalled();
  });

  it("creates a new chat with the selected model", async () => {
    aiMocks.createChat.mockResolvedValue({ id: "chat-new", title: "New Chat" });

    renderChatPage();

    const trigger = await screen.findByRole("combobox");
    // 等模型目录加载完成后再展开，避免在空选项状态下打开。
    await waitFor(() => expect(trigger.textContent).toContain("GPT-4o"));
    fireEvent.click(trigger);
    // 选择非默认项（第一个为 openai:gpt-4o）。
    fireEvent.click(await screen.findByRole("option", { name: "Claude Sonnet 4.5" }));
    fireEvent.click(screen.getByRole("button", { name: "New chat" }));

    // TanStack 会向 mutationFn 追加第二个 context 参数，这里只断言业务入参。
    await waitFor(() => {
      expect(aiMocks.createChat).toHaveBeenCalledWith(
        { provider: "anthropic", model: "claude-sonnet-4-5" },
        expect.anything(),
      );
    });
    await waitFor(() => {
      expect(messagesGetMock).toHaveBeenCalledWith(
        expect.objectContaining({ param: { id: "chat-new" } }),
      );
    });
  });

  it("deletes a chat from the conversation list", async () => {
    renderChatPage();

    await screen.findByRole("button", { name: "Trip planning" });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete Trip planning" }).at(0) as HTMLButtonElement,
    );

    // TanStack 会向 mutationFn 追加第二个 context 参数，这里只断言业务入参。
    await waitFor(() => {
      expect(aiMocks.deleteChat).toHaveBeenCalledWith({ id: "chat-1" }, expect.anything());
    });
  });

  it("shows a dismissible alert on stream error", async () => {
    useChatState.current = { ...useChatState.current, error: new Error("boom") };

    renderChatPage();

    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();

    // useChat 无 clearError：横幅由本地 errorDismissed 状态收起。
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("会话切换重挂载 ChatSurface（key=chatId）：错误横幅的本地收起态被重置", async () => {
    useChatState.current = { ...useChatState.current, error: new Error("boom") };

    renderChatPage();
    fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    // 无 key 时 ChatSurface 只是重渲染，errorDismissed 会跨会话残留 → 横幅不再出现。
    fireEvent.click(screen.getByRole("button", { name: "Refactor ideas" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("boom")).toBeTruthy();
  });

  describe("402/502 响应消息透出（I2）", () => {
    const renderActiveChat = async () => {
      renderChatPage();
      fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));
      await waitFor(() => expect(connectionOptions.current).toBeDefined());
      const fetchClient = connectionOptions.current?.fetchClient;
      if (typeof fetchClient !== "function") {
        throw new Error("fetchServerSentEvents 未收到 fetchClient");
      }
      return fetchClient as typeof fetch;
    };

    const stubResponse = (init: {
      ok: boolean;
      status: number;
      statusText?: string;
      body: string;
    }) =>
      ({
        ok: init.ok,
        status: init.status,
        statusText: init.statusText ?? "",
        clone: () => ({ text: async () => init.body }),
      }) as unknown as Response;

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("非 2xx 时抛出响应正文（而非 status 文案）", async () => {
      const fetchClient = await renderActiveChat();
      const body = JSON.stringify({ code: 1001, message: "insufficient credits" });
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            stubResponse({ body, ok: false, status: 402, statusText: "Payment Required" }),
          ),
      );

      await expect(fetchClient("/api/llm/chats/chat-1/messages", {})).rejects.toThrow(body);
    });

    it("非 2xx 且正文为空时退回 HTTP error 文案", async () => {
      const fetchClient = await renderActiveChat();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            stubResponse({ body: "", ok: false, status: 502, statusText: "Bad Gateway" }),
          ),
      );

      await expect(fetchClient("/api/llm/chats/chat-1/messages", {})).rejects.toThrow(
        "HTTP error! status: 502",
      );
    });

    it("2xx 响应原样返回", async () => {
      const fetchClient = await renderActiveChat();
      const okResponse = stubResponse({ body: "", ok: true, status: 200 });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse));

      await expect(fetchClient("/api/llm/chats/chat-1/messages", {})).resolves.toBe(okResponse);
    });

    it("onError 解开 StreamReadError 包装后 toast 响应正文", async () => {
      renderChatPage();
      fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));
      await waitFor(() => expect(useChatState.current.onError).toBeTypeOf("function"));

      const body = JSON.stringify({ code: 1001, message: "insufficient credits" });
      // fetchClient 抛出的错误经 fetchEventSource 包成 StreamReadError。
      const wrapped = Object.assign(new Error("Stream response body read failed"), {
        cause: new Error(body),
        name: "StreamReadError",
      });
      (useChatState.current.onError as (error: Error) => void)(wrapped);

      expect(toastMocks.error).toHaveBeenCalledWith(body);
    });

    it("错误横幅同样展示解包后的响应正文", async () => {
      const wrapped = Object.assign(new Error("Stream response body read failed"), {
        cause: new Error("upstream provider unavailable"),
        name: "StreamReadError",
      });
      useChatState.current = { ...useChatState.current, error: wrapped };

      renderChatPage();
      fireEvent.click(await screen.findByRole("button", { name: "Trip planning" }));

      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(screen.getByText("upstream provider unavailable")).toBeTruthy();
    });
  });
});
