import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ToolStatus } from "../../bridge";
import "./ChatView.css";

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    interrupted?: boolean;
    toolRuns?: ToolRun[];
}

export interface ToolRun extends ToolStatus {
    id: number;
}

interface ChatViewProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
}

export default function ChatView({ messages, isLoading, error }: ChatViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, isLoading, error]);

    if (messages.length === 0 && !isLoading && !error) {
        return (
            <div className="chat-view">
                <div className="chat-empty">
                    <h1 className="chat-empty-title">Welcome to JustCode</h1>
                    <p className="chat-empty-sub">
                        Ask anything about your codebase — refactors, bugs, or new features.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-view">
            <div className="chat-messages" ref={scrollRef}>
                {error && (
                    <div className="chat-error">
                        <span className="chat-error-label">Error</span>
                        {error}
                    </div>
                )}

                {messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                        <div className="message-bubble">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.text}
                            </ReactMarkdown>
                            {message.toolRuns && message.toolRuns.length > 0 && (
                                <div className="message-tool-runs">
                                    {message.toolRuns.map((run) => (
                                        <ToolRunCard key={run.id} run={run} />
                                    ))}
                                </div>
                            )}
                            {message.interrupted && (
                                <div className="message-interrupted">Stopped</div>
                            )}
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="message assistant">
                        <div className="message-bubble thinking">
                            <span className="dot" />
                            <span className="dot" />
                            <span className="dot" />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function ToolRunCard({ run }: { run: ToolRun }) {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className={`tool-run ${run.state} ${expanded ? "open" : ""}`}>
            <button
                className="tool-run-header"
                onClick={() => setExpanded((value) => !value)}
                title={expanded ? "Collapse" : "Expand"}
            >
                <span className={`tool-run-status ${run.state}`} />
                <span className="tool-run-name">{run.name}</span>
                <span className="tool-run-chevron">▸</span>
            </button>
            {expanded && (
                <>
                    <pre className="tool-run-args">{formatArgs(run.arguments ?? "")}</pre>
                    {run.output && <pre className="tool-run-output">{run.output}</pre>}
                </>
            )}
        </div>
    );
}

function formatArgs(args: string): string {
    try {
        const parsed = JSON.parse(args) as Record<string, unknown>;
        const command = parsed?.command;
        if (typeof command === "string") return command;
        return JSON.stringify(parsed, null, 2);
    } catch {
        return args;
    }
}

