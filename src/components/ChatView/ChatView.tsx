import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./ChatView.css";

export interface ChatMessage {
    role: "user" | "assistant";
    text: string;
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

                {messages.map((message, i) => (
                    <div key={i} className={`message ${message.role}`}>
                        <div className="message-bubble">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.text}
                            </ReactMarkdown>
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

