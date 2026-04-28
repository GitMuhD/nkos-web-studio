import { useRef, useEffect, useMemo, useState } from "react";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import type { SSEMessage } from "../hooks/use-sse";
import { chatSelectors, useChatStore } from "../store/chat";
import { useServiceStore } from "../store/service";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "../components/ai-elements/reasoning";
import { ChatMessage } from "../components/chat/ChatMessage";
import { QuickActions } from "../components/chat/QuickActions";
import { ToolExecutionSteps } from "../components/chat/ToolExecutionSteps";
import {
  Loader2,
  BotMessageSquare,
  ArrowUp,
  ChevronDown,
  Check,
  Square,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { Shimmer } from "../components/ai-elements/shimmer";
import {
  Message,
  MessageContent,
} from "../components/ai-elements/message";
import {
  filterModelGroups,
  getBookCreateSessionId,
  setBookCreateSessionId,
} from "./chat-page-state";

// -- Types --

interface Nav {
  toDashboard: () => void;
  toBook: (id: string) => void;
  toServices: () => void;
}

export interface ChatPageProps {
  readonly activeBookId?: string;
  readonly nav: Nav;
  readonly theme: Theme;
  readonly t: TFunction;
  readonly sse: { messages: ReadonlyArray<SSEMessage>; connected: boolean };
}

const OUTPUT_FONT_SIZE_KEY = "inkos-output-font-size";
const OUTPUT_FONT_SIZE_OPTIONS = [12, 14, 16, 18, 20] as const;
const TASK_PANEL_COLLAPSED_KEY = "inkos-task-panel-collapsed";

// -- Component --

export function ChatPage({ activeBookId, nav, theme, t, sse: _sse }: ChatPageProps) {
  // -- Store selectors --
  const messages = useChatStore(chatSelectors.activeMessages);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const input = useChatStore((s) => s.input);
  const loading = useChatStore(chatSelectors.isActiveSessionStreaming);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const selectedService = useChatStore((s) => s.selectedService);
  const activeTaskStatus = useChatStore((s) => s.activeSessionId ? s.sessions[s.activeSessionId]?.taskStatus ?? null : null);
  // -- Store actions --
  const setInput = useChatStore((s) => s.setInput);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopMessage = useChatStore((s) => s.stopMessage);
  const setSelectedModel = useChatStore((s) => s.setSelectedModel);
  const loadSessionList = useChatStore((s) => s.loadSessionList);
  const createSession = useChatStore((s) => s.createSession);
  const loadSessionDetail = useChatStore((s) => s.loadSessionDetail);
  const activateSession = useChatStore((s) => s.activateSession);

  const [outputFontSize, setOutputFontSize] = useState<number>(() => {
    const saved = Number(globalThis.localStorage?.getItem(OUTPUT_FONT_SIZE_KEY));
    return OUTPUT_FONT_SIZE_OPTIONS.includes(saved as typeof OUTPUT_FONT_SIZE_OPTIONS[number]) ? saved : 14;
  });
  const [taskPanelCollapsed, setTaskPanelCollapsed] = useState<boolean>(() => globalThis.localStorage?.getItem(TASK_PANEL_COLLAPSED_KEY) === "true");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    globalThis.localStorage?.setItem(OUTPUT_FONT_SIZE_KEY, String(outputFontSize));
  }, [outputFontSize]);

  useEffect(() => {
    globalThis.localStorage?.setItem(TASK_PANEL_COLLAPSED_KEY, String(taskPanelCollapsed));
  }, [taskPanelCollapsed]);

  const isZh = t("nav.connected") === "\u5DF2\u8FDE\u63A5";
  const hasBook = Boolean(activeBookId);

  // Derived: is the assistant currently streaming/thinking/executing tools?
  const isStreaming = useMemo(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return false;
    return last.thinkingStreaming === true
      || !last.content
      || (last.toolExecutions?.some(t => t.status === "running" || t.status === "processing") ?? false);
  }, [messages]);

  // -- Model picker: read raw state, derive with useMemo (stable refs) --
  const services = useServiceStore((s) => s.services);
  const servicesLoading = useServiceStore((s) => s.servicesLoading);
  const modelsByService = useServiceStore((s) => s.modelsByService);
  const fetchServices = useServiceStore((s) => s.fetchServices);
  const fetchModels = useServiceStore((s) => s.fetchModels);

  useEffect(() => { void fetchServices(); }, [fetchServices]);
  useEffect(() => {
    for (const svc of services) {
      if (svc.connected) void fetchModels(svc.service);
    }
  }, [services, fetchModels]);

  const modelPickerStatus = useMemo(() => {
    if (servicesLoading || services.length === 0) return "loading" as const;
    const connected = services.filter((s) => s.connected);
    if (connected.length === 0) return "no-models" as const;
    if (connected.some((s) => modelsByService[s.service]?.loading)) return "loading" as const;
    return connected.some((s) => (modelsByService[s.service]?.models.length ?? 0) > 0)
      ? "ready" as const : "no-models" as const;
  }, [services, servicesLoading, modelsByService]);

  const groupedModels = useMemo(() => {
    return services
      .filter((s) => s.connected && (modelsByService[s.service]?.models.length ?? 0) > 0)
      .map((s) => ({ service: s.service, label: s.label, models: modelsByService[s.service]!.models }));
  }, [services, modelsByService]);

  // Auto-select first model when models load and none selected
  useEffect(() => {
    if (!selectedModel && groupedModels.length > 0) {
      const first = groupedModels[0];
      if (first.models.length > 0) {
        setSelectedModel(first.models[0].id, first.service);
      }
    }
  }, [groupedModels, selectedModel, setSelectedModel]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Entering a book loads its latest session; book-create mode persists its orphan session in localStorage.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (activeBookId) {
        await loadSessionList(activeBookId);
        if (cancelled) return;

        const state = useChatStore.getState();
        const currentSession = state.activeSessionId ? state.sessions[state.activeSessionId] : null;
        if (currentSession?.bookId === activeBookId) {
          await loadSessionDetail(currentSession.sessionId);
          return;
        }
        const ids = state.sessionIdsByBook[activeBookId] ?? [];
        if (ids.length > 0) {
          activateSession(ids[0]);
          await loadSessionDetail(ids[0]);
          return;
        }

        await createSession(activeBookId);
        return;
      }

      const existingId = getBookCreateSessionId();
      if (existingId) {
        await loadSessionDetail(existingId);
        if (cancelled) return;

        const state = useChatStore.getState();
        const session = state.sessions[existingId];
        if (session && session.bookId === null) {
          activateSession(existingId);
          return;
        }
      }

      const newSessionId = await createSession(null);
      if (!cancelled) {
        setBookCreateSessionId(newSessionId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBookId, activateSession, createSession, loadSessionDetail, loadSessionList]);

  const onSend = (text: string) => {
    if (!activeSessionId) return;
    void sendMessage(activeSessionId, text, activeBookId);
  };

  const handleQuickAction = (command: string) => {
    if (!activeSessionId) return;
    void sendMessage(activeSessionId, command, activeBookId);
  };

  const emptyGuidance = isZh
    ? "\u544A\u8BC9\u6211\u4F60\u60F3\u5199\u4EC0\u4E48\u2014\u2014\u9898\u6750\u3001\u4E16\u754C\u89C2\u3001\u4E3B\u89D2\u3001\u6838\u5FC3\u51B2\u7A81"
    : "Tell me what you want to write \u2014 genre, world, protagonist, core conflict";

  return (
    <div className="flex flex-col h-full flex-1 min-w-0">
      {/* Message scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        {messages.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center select-none">
            <div className="w-14 h-14 rounded-2xl border border-dashed border-border flex items-center justify-center mb-4 bg-secondary/30 opacity-40">
              <BotMessageSquare size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground/70 max-w-md leading-7">
              {emptyGuidance}
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={`${msg.timestamp}-${i}`}>
                {msg.role === "user" ? (
                  /* User message */
                  <ChatMessage role="user" content={msg.content} timestamp={msg.timestamp} theme={theme} outputFontSize={outputFontSize} />
                ) : msg.parts && msg.parts.length > 0 ? (
                  /* Assistant message — parts-based rendering (chronological) */
                  /* Merge consecutive utility tool parts into one group */
                  <>
                    {(() => {
                      type RenderItem =
                        | { kind: "thinking"; pi: number; part: Extract<typeof msg.parts[0], { type: "thinking" }> }
                        | { kind: "text"; pi: number; part: Extract<typeof msg.parts[0], { type: "text" }> }
                        | { kind: "tools"; parts: Array<Extract<typeof msg.parts[0], { type: "tool" }>>; startIdx: number };

                      const items: RenderItem[] = [];
                      for (let pi = 0; pi < msg.parts!.length; pi++) {
                        const part = msg.parts![pi];
                        if (part.type === "thinking") {
                          items.push({ kind: "thinking", pi, part });
                        } else if (part.type === "text") {
                          items.push({ kind: "text", pi, part });
                        } else if (part.type === "tool") {
                          // Merge consecutive tool parts into one group
                          const last = items[items.length - 1];
                          if (last?.kind === "tools") {
                            last.parts.push(part);
                          } else {
                            items.push({ kind: "tools", parts: [part], startIdx: pi });
                          }
                        }
                      }

                      return items.map((item) => {
                        if (item.kind === "thinking") {
                          return (
                            <div key={`t-${item.pi}`} className="mb-2">
                              <Reasoning isStreaming={item.part.streaming} style={{ fontSize: `${Math.max(11, outputFontSize - 1)}px` }}>
                                <ReasoningTrigger />
                                <ReasoningContent>{item.part.content}</ReasoningContent>
                              </Reasoning>
                            </div>
                          );
                        }
                        if (item.kind === "tools") {
                          return <ToolExecutionSteps key={`x-${item.startIdx}`} executions={item.parts.map(p => p.execution)} outputFontSize={outputFontSize} />;
                        }
                        if (item.kind === "text" && item.part.content) {
                          return (
                            <ChatMessage
                              key={`c-${item.pi}`}
                              role="assistant"
                              content={item.part.content}
                              timestamp={msg.timestamp}
                              theme={theme}
                              outputFontSize={outputFontSize}
                            />
                          );
                        }
                        return null;
                      });
                    })()}
                  </>
                ) : (
                  /* Assistant message — fallback (no parts, e.g. error messages) */
                  <ChatMessage
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    theme={theme}
                    outputFontSize={outputFontSize}
                  />
                )}
              </div>
            ))}

            {/* Loading indicator — only when loading and no streaming activity */}
            {loading && !isStreaming && (
              <Message from="assistant">
                <MessageContent>
                  <Shimmer className="text-sm" duration={1.5} style={{ fontSize: `${Math.max(11, outputFontSize - 1)}px` }}>
                    {isZh ? "思考中..." : "Thinking..."}
                  </Shimmer>
                </MessageContent>
              </Message>
            )}

          </div>
        )}
      </div>

      {activeTaskStatus && loading && (
        <div className="shrink-0 max-w-3xl mx-auto w-full px-4 pb-3">
          <div className={`rounded-2xl border border-primary/20 bg-primary/5 px-4 transition-all ${taskPanelCollapsed ? "py-2 space-y-2" : "py-3 space-y-3"}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-primary">
                  <Loader2 size={14} className="animate-spin" />
                  <span className="truncate">{activeTaskStatus.currentTask}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground truncate">
                  {activeTaskStatus.stage}
                  {typeof activeTaskStatus.elapsedMs === "number" ? ` · ${Math.round(activeTaskStatus.elapsedMs / 1000)}s` : ""}
                  {taskPanelCollapsed && activeTaskStatus.detail ? ` · ${activeTaskStatus.detail}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right text-xs text-muted-foreground">
                  <div>{activeTaskStatus.completedTasks}/{activeTaskStatus.totalTasks} 已完成</div>
                  <div>等待 {activeTaskStatus.waitingTasks} 个任务</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTaskPanelCollapsed((value) => !value)}
                  className="h-7 w-7 rounded-lg border border-primary/20 bg-background/50 text-muted-foreground hover:text-primary hover:bg-background transition-colors flex items-center justify-center"
                  title={taskPanelCollapsed ? "展开任务列表" : "收起任务列表"}
                >
                  {taskPanelCollapsed ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                </button>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-primary/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.max(5, Math.min(100, (activeTaskStatus.completedTasks / Math.max(1, activeTaskStatus.totalTasks)) * 100))}%` }}
              />
            </div>
            {!taskPanelCollapsed && activeTaskStatus.tasks && activeTaskStatus.tasks.length > 0 && (
              <div className="rounded-xl border border-primary/10 bg-background/50 divide-y divide-border/40 overflow-hidden max-h-56 overflow-y-auto">
                {activeTaskStatus.tasks.map((task, index) => {
                  const marker = task.status === "completed"
                    ? "✓"
                    : task.status === "running"
                      ? "…"
                      : task.status === "error"
                        ? "!"
                        : task.status === "stopped"
                          ? "■"
                          : String(index + 1);
                  const markerClass = task.status === "completed"
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : task.status === "running"
                      ? "bg-primary/15 text-primary animate-pulse"
                      : task.status === "error"
                        ? "bg-destructive/15 text-destructive"
                        : task.status === "stopped"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-muted text-muted-foreground";
                  return (
                    <div key={task.id} className="flex items-start gap-3 px-3 py-2.5">
                      <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${markerClass}`}>
                        {marker}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium text-foreground truncate">
                            {task.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground shrink-0">
                            {task.status === "completed"
                              ? "已完成"
                              : task.status === "running"
                                ? "进行中"
                                : task.status === "error"
                                  ? "失败"
                                  : task.status === "stopped"
                                    ? "已停止"
                                    : "等待中"}
                          </div>
                        </div>
                        {task.description && (
                          <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
                            {task.description}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!taskPanelCollapsed && activeTaskStatus.detail && (
              <div className="text-xs text-muted-foreground leading-6">
                当前：{activeTaskStatus.detail}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick actions (only when a book is active) */}
      {hasBook && (
        <div className="shrink-0 max-w-3xl mx-auto w-full px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <QuickActions
              onAction={handleQuickAction}
              disabled={loading || !activeSessionId}
              isZh={isZh}
            />
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground shrink-0">
              <span>{isZh ? "输出字号" : "Output size"}</span>
              <div className="flex items-center rounded-lg border border-border/30 bg-secondary/40 p-0.5">
                {OUTPUT_FONT_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setOutputFontSize(size)}
                    disabled={loading}
                    className={`px-2 py-1 rounded-md text-[11px] transition-colors disabled:opacity-40 ${outputFontSize === size ? "bg-primary text-primary-foreground" : "hover:bg-background/80"}`}
                    title={isZh ? `输出文字 ${size}px` : `Output text ${size}px`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0 border-t border-border/40 px-4 py-3">
        <div className="max-w-3xl mx-auto">
            <div className="rounded-xl bg-secondary/30 transition-all">
              <div className="flex items-center gap-2 px-3 py-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(input); } }}
                  placeholder={isZh ? "输入指令..." : "Enter command..."}
                  disabled={loading || !activeSessionId}
                  rows={1}
                  className="flex-1 bg-transparent text-sm leading-6 placeholder:text-muted-foreground/50 outline-none! border-none! ring-0! shadow-none focus:outline-none! focus:ring-0! focus:border-none! resize-none disabled:opacity-50 max-h-[200px] overflow-y-auto"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (loading && activeSessionId) {
                      void stopMessage(activeSessionId);
                    } else {
                      onSend(input);
                    }
                  }}
                  disabled={(!loading && !input.trim()) || !activeSessionId}
                  title={loading ? (isZh ? "停止当前指令" : "Stop current command") : (isZh ? "发送" : "Send")}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:scale-100 shadow-sm ${loading ? "bg-destructive text-destructive-foreground shadow-destructive/20" : "bg-primary text-primary-foreground shadow-primary/20"}`}
                >
                  {loading ? <Square size={13} fill="currentColor" /> : <ArrowUp size={14} strokeWidth={2.5} />}
                </button>
              </div>
              <div className="flex items-center gap-2 px-3 pb-2 border-t border-border/20 pt-1.5">
                {modelPickerStatus === "loading" ? (
                  <span className="text-xs text-muted-foreground/40 animate-pulse">加载模型...</span>
                ) : modelPickerStatus === "ready" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted text-sm transition-colors cursor-pointer">
                      <span className="font-medium text-xs truncate max-w-[140px]">
                        {selectedModel ?? "选择模型"}
                      </span>
                      <ChevronDown size={14} className="text-muted-foreground" />
                    </DropdownMenuTrigger>
                    <ModelPickerContent
                      groupedModels={groupedModels}
                      selectedModel={selectedModel}
                      selectedService={selectedService}
                      onSelect={setSelectedModel}
                      onManage={() => nav.toServices()}
                    />
                  </DropdownMenu>
                ) : (
                  <button
                    onClick={() => nav.toServices()}
                    className="text-xs text-muted-foreground/50 hover:text-primary transition-colors"
                  >
                    配置模型 →
                  </button>
                )}
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}

function ModelPickerContent({
  groupedModels,
  selectedModel,
  selectedService,
  onSelect,
  onManage,
}: {
  groupedModels: ReadonlyArray<{ service: string; label: string; models: ReadonlyArray<{ id: string; name?: string }> }>;
  selectedModel: string | null;
  selectedService: string | null;
  onSelect: (model: string, service: string) => void;
  onManage: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => filterModelGroups(groupedModels, search), [groupedModels, search]);

  return (
    <DropdownMenuContent side="top" align="start" className="w-64 max-h-80 flex flex-col">
      <div className="px-2 py-1.5 border-b border-border/30">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索模型..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </div>
      <div className="overflow-y-auto flex-1">
        {filtered.map((group) => (
          <div key={group.service}>
            <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              {group.label}
            </div>
            {group.models.map((m) => {
              const isSelected = selectedModel === m.id && selectedService === group.service;
              return (
                <DropdownMenuItem
                  key={`${group.service}:${m.id}`}
                  onClick={() => onSelect(m.id, group.service)}
                  className={isSelected ? "bg-muted/50" : ""}
                >
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-sm">{m.name ?? m.id}</span>
                    {isSelected && <Check size={14} className="text-primary shrink-0" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground/50 text-center italic">
            无匹配模型
          </div>
        )}
      </div>
      <div className="border-t border-border/30">
        <DropdownMenuItem onClick={onManage} className="text-primary">
          管理服务商
        </DropdownMenuItem>
      </div>
    </DropdownMenuContent>
  );
}
