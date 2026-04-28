import { useEffect, useMemo, useRef } from "react";
import { useApi } from "../hooks/use-api";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import type { SSEMessage } from "../hooks/use-sse";
import { useColors } from "../hooks/use-colors";

interface LogEntry {
  readonly level?: string;
  readonly tag?: string;
  readonly message: string;
  readonly timestamp?: string;
  readonly source?: "file" | "live";
  readonly event?: string;
}

interface Nav {
  toDashboard: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  error: "text-destructive",
  warn: "text-amber-500",
  warning: "text-amber-500",
  info: "text-primary/70",
  debug: "text-muted-foreground/50",
};

function coerceLiveLog(message: SSEMessage): LogEntry | null {
  const data = message.data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return null;
  if (message.event === "log") {
    return {
      level: typeof data.level === "string" ? data.level : "info",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      message: typeof data.message === "string" ? data.message : JSON.stringify(data),
      timestamp: new Date(message.timestamp).toISOString(),
      source: "live",
      event: message.event,
    };
  }
  if (message.event === "agent:status") {
    const task = typeof data.currentTask === "string" ? data.currentTask : "执行中";
    const stage = typeof data.stage === "string" ? data.stage : "运行中";
    const completed = typeof data.completedTasks === "number" ? data.completedTasks : 0;
    const total = typeof data.totalTasks === "number" ? data.totalTasks : 0;
    const waiting = typeof data.waitingTasks === "number" ? data.waitingTasks : 0;
    const detail = typeof data.detail === "string" ? `｜${data.detail}` : "";
    return {
      level: "info",
      tag: "agent",
      message: `${task} / ${stage}｜${completed}/${total} 已完成，等待 ${waiting} 个任务${detail}`,
      timestamp: new Date(message.timestamp).toISOString(),
      source: "live",
      event: message.event,
    };
  }
  if (message.event.endsWith(":start") || message.event.endsWith(":complete") || message.event.endsWith(":error") || message.event === "agent:stopped") {
    return {
      level: message.event.endsWith(":error") ? "error" : "info",
      tag: message.event,
      message: typeof data.message === "string" ? data.message : JSON.stringify(data),
      timestamp: new Date(message.timestamp).toISOString(),
      source: "live",
      event: message.event,
    };
  }
  return null;
}

export function LogViewer({ nav, theme, t, sse }: { nav: Nav; theme: Theme; t: TFunction; sse: { messages: ReadonlyArray<SSEMessage>; connected: boolean } }) {
  const c = useColors(theme);
  const { data, refetch } = useApi<{ entries: ReadonlyArray<LogEntry> }>("/logs");
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveEntries = useMemo(
    () => sse.messages.map(coerceLiveLog).filter((entry): entry is LogEntry => Boolean(entry)),
    [sse.messages],
  );
  const entries = useMemo(
    () => [
      ...(data?.entries ?? []).map((entry) => ({ ...entry, source: "file" as const })),
      ...liveEntries,
    ].slice(-200),
    [data?.entries, liveEntries],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={nav.toDashboard} className={c.link}>{t("bread.home")}</button>
        <span className="text-border">/</span>
        <span className="text-foreground">{t("logs.title")}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">{t("logs.title")}</h1>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-block h-2 w-2 rounded-full ${sse.connected ? "bg-green-500" : "bg-muted-foreground/40"}`} />
            <span>{sse.connected ? "实时日志已连接" : "实时日志未连接"}</span>
            {liveEntries.length > 0 && <span>· 本次会话 {liveEntries.length} 条实时事件</span>}
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className={`px-4 py-2.5 text-sm rounded-md ${c.btnSecondary}`}
        >
          {t("common.refresh")}
        </button>
      </div>

      <div className={`border ${c.cardStatic} rounded-lg overflow-hidden`}>
        <div ref={scrollRef} className="p-4 max-h-[600px] overflow-y-auto">
          {entries.length > 0 ? (
            <div className="space-y-1 font-mono text-sm leading-relaxed">
              {entries.map((entry, i) => (
                <div key={`${entry.source}-${entry.timestamp ?? i}-${i}`} className="flex gap-2">
                  {entry.timestamp && (
                    <span className="text-muted-foreground shrink-0 w-20 tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                  {entry.level && (
                    <span className={`shrink-0 w-12 uppercase ${LEVEL_COLORS[entry.level] ?? "text-muted-foreground"}`}>
                      {entry.level}
                    </span>
                  )}
                  {entry.tag && (
                    <span className="text-primary/70 shrink-0">[{entry.tag}]</span>
                  )}
                  {entry.source === "live" && (
                    <span className="text-green-600 dark:text-green-400 shrink-0">●</span>
                  )}
                  <span className="text-foreground/80 break-words">{entry.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground text-sm italic py-12 text-center">
              {t("logs.empty")}
            </div>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("logs.showingRecent")}；绿色圆点表示本次网页实时收到的日志事件。
      </p>
    </div>
  );
}
