import type React from "react";
import type { Theme } from "../../hooks/use-theme";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../ai-elements/message";
import { XCircle } from "lucide-react";

export interface ChatMessageProps {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly timestamp: number;
  readonly theme: Theme;
  readonly outputFontSize?: number;
}

export function ChatMessage({
  role,
  content,
  outputFontSize = 16,
}: ChatMessageProps) {
  const isUser = role === "user";
  const isError = content.startsWith("\u2717");
  const fontStyle = {
    fontSize: `${outputFontSize}px`,
    "--chat-output-font-size": `${outputFontSize}px`,
  } as React.CSSProperties;

  return (
    <Message from={role} style={fontStyle}>
      <MessageContent className="chat-output-content">
        {isUser ? (
          <div className="leading-relaxed">{content}</div>
        ) : isError ? (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle size={14} className="shrink-0" />
            <span>{content.replace(/^\u2717\s*/, "")}</span>
          </div>
        ) : (
          <MessageResponse>{content}</MessageResponse>
        )}
      </MessageContent>
    </Message>
  );
}
