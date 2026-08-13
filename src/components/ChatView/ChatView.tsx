import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type MessageBlock, type ToolRun } from "../../bridge";
import { type ChatMessage } from "../../messages";
import { useCopy } from "../../hooks/useCopy";
import "./ChatView.css";
import readIcon from "../../assets/tools/read.svg";
import editIcon from "../../assets/tools/edit.svg";
import writeIcon from "../../assets/tools/write.svg";
import searchIcon from "../../assets/tools/search.svg";
import terminalIcon from "../../assets/tools/terminal.svg";
import globeIcon from "../../assets/tools/globe.svg";
import linkIcon from "../../assets/tools/link.svg";
import toolIcon from "../../assets/tools/tool.svg";
import folderOpenIcon from "../../assets/folder_open.svg";
import settingsIcon from "../../assets/settings.svg";
import folderCreateIcon from "../../assets/folder_create.svg";
import forkIcon from "../../assets/fork.svg";
import deleteIcon from "../../assets/delete.svg";
import thinkingIcon from "../../assets/thinking.svg";

interface ChatViewProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    toolAutoExtend?: boolean;
    hasConfigs: boolean;
    hasProjects: boolean;
    onCreateProject: () => void;
    onOpenSettings: () => void;
    onSelectPrompt?: (prompt: string) => void;
    onFork?: () => void;
    onDeleteMessage?: (id: string) => void;
}

const SCROLL_STICK_THRESHOLD = 40;

const TOOL_META: Record<string, { label: string; icon: string }> = {
    read: { label: "Read File", icon: readIcon },
    list_dir: { label: "List Directory", icon: folderOpenIcon },
    edit: { label: "Edit File", icon: editIcon },
    write: { label: "Write File", icon: writeIcon },
    search: { label: "Search", icon: searchIcon },
    bash: { label: "Command", icon: terminalIcon },
    web_search: { label: "Web Search", icon: globeIcon },
    web_fetch: { label: "Fetch URL", icon: linkIcon },
};

const DEFAULT_TOOL_META = { label: "Tool", icon: toolIcon };

export default function ChatView({
    messages,
    isLoading,
    error,
    toolAutoExtend = false,
    hasConfigs,
    hasProjects,
    onCreateProject,
    onOpenSettings,
    onSelectPrompt,
    onFork,
    onDeleteMessage,
}: ChatViewProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [stickToBottom, setStickToBottom] = useState(true);

    useEffect(() => {
        const el = scrollRef.current;
        if (el && stickToBottom) el.scrollTop = el.scrollHeight;
    }, [messages, isLoading, error, stickToBottom]);

    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        setStickToBottom(distanceFromBottom < SCROLL_STICK_THRESHOLD);
    }

    function scrollToBottom() {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        setStickToBottom(true);
    }

    if (messages.length === 0 && !isLoading && !error) {
        return (
            <div className="chat-view">
                <div className="chat-empty">
                    <h1 className="chat-empty-title">Welcome to JustCode</h1>
                    <p className="chat-empty-sub">
                        Your coding agent. Pick a project, pick a model, or click a suggestion to start.
                    </p>
                    {(!hasProjects || !hasConfigs) && (
                        <div className="chat-quick-actions">
                            {!hasProjects && (
                                <button className="chat-quick-btn" onClick={onCreateProject}>
                                    <img src={folderCreateIcon} alt="" />
                                    <span>Create Project</span>
                                </button>
                            )}
                            {!hasConfigs && (
                                <button className="chat-quick-btn" onClick={onOpenSettings}>
                                    <img src={settingsIcon} alt="" />
                                    <span>Add API Config</span>
                                </button>
                            )}
                        </div>
                    )}

                    <div className="chat-suggestions">
                        <div className="chat-suggestions-grid">
                            <button
                                className="chat-suggestion-chip"
                                onClick={() => onSelectPrompt?.("Explain the structure and architecture of this project.")}
                            >
                                <span className="chip-icon">🔍</span>
                                <span>Explain project architecture</span>
                            </button>
                            <button
                                className="chat-suggestion-chip"
                                onClick={() => onSelectPrompt?.("Find potential bugs, edge cases, or code smells.")}
                            >
                                <span className="chip-icon">🐛</span>
                                <span>Find bugs & edge cases</span>
                            </button>
                            <button
                                className="chat-suggestion-chip"
                                onClick={() => onSelectPrompt?.("Help me write comprehensive unit tests.")}
                            >
                                <span className="chip-icon">🧪</span>
                                <span>Write unit tests</span>
                            </button>
                            <button
                                className="chat-suggestion-chip"
                                onClick={() => onSelectPrompt?.("Suggest refactoring improvements for cleaner code.")}
                            >
                                <span className="chip-icon">⚡</span>
                                <span>Suggest refactoring</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="chat-view">
            <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
                {error && (
                    <div className="chat-error">
                        <span className="chat-error-label">Error</span>
                        {error}
                    </div>
                )}

                {messages.map((message) => {
                    if (message.role === "system") {
                        return <ContextBanner key={message.id} text={message.text} />;
                    }
                    return (
                        <div key={message.id} className={`message ${message.role}`}>
                            <MessageBubble
                                message={message}
                                isLoading={isLoading}
                                toolAutoExtend={toolAutoExtend}
                                onFork={onFork}
                                onDeleteMessage={onDeleteMessage}
                            />
                        </div>
                    );
                })}
            </div>

            {!stickToBottom && (
                <button className="scroll-to-bottom-btn" onClick={scrollToBottom} title="Scroll to bottom">
                    ↓ New messages
                </button>
            )}
        </div>
    );
}

function Markdown({ text }: { text: string }) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>;
}

function blockKey(block: MessageBlock, index: number): string {
    if (block.type === "tool") return `tool-${block.run.id}`;
    if (block.type === "thinking") return `thinking-${index}`;
    return `text-${index}`;
}

function MessageBubble({
    message,
    isLoading,
    toolAutoExtend,
    onFork,
    onDeleteMessage,
}: {
    message: ChatMessage;
    isLoading: boolean;
    toolAutoExtend: boolean;
    onFork?: () => void;
    onDeleteMessage?: (id: string) => void;
}) {
    const blocks = message.blocks ?? [];
    const hasContent = blocks.length > 0 || Boolean(message.text);

    return (
        <div className="message-bubble">
            {hasContent ? (
                blocks.length > 0 ? (
                    blocks.map((block, blockIndex) => (
                        <MessageBlockView
                            key={blockKey(block, blockIndex)}
                            block={block}
                            streaming={isLoading && blockIndex === blocks.length - 1}
                            toolAutoExtend={toolAutoExtend}
                        />
                    ))
                ) : (
                    <Markdown text={message.text} />
                )
            ) : (
                <ThinkingFluid />
            )}
            {message.interrupted && (
                <div className="message-interrupted">Stopped</div>
            )}
            {!isLoading && (onFork || onDeleteMessage) && (
                <MessageActions
                    message={message}
                    onFork={onFork}
                    onDeleteMessage={onDeleteMessage}
                />
            )}
        </div>
    );
}

function MessageBlockView({
    block,
    streaming,
    toolAutoExtend,
}: {
    block: MessageBlock;
    streaming: boolean;
    toolAutoExtend: boolean;
}) {
    if (block.type === "text") return <Markdown text={block.text} />;
    if (block.type === "thinking") {
        return <ThinkingBlock text={block.text} streaming={streaming} />;
    }
    if (block.type === "tool") {
        return <ToolRunCard run={block.run} autoExtend={toolAutoExtend} />;
    }
    return null;
}

type ToolStatusKey = "running" | "success" | "error";

function ContextBanner({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={`context-banner ${expanded ? "open" : ""}`}>
            <button
                className="context-header"
                onClick={() => setExpanded((value) => !value)}
                title={expanded ? "Collapse" : "Expand"}
            >
                <span>Context summary</span>
                <span className="context-chevron">▸</span>
            </button>
            {expanded && (
                <div className="context-body">
                    <Markdown text={text} />
                </div>
            )}
        </div>
    );
}

function ThinkingBlock({ text, streaming }: { text: string; streaming: boolean }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={`thinking-block ${expanded ? "open" : ""} ${streaming ? "streaming" : ""}`}>
            <button
                className="thinking-header"
                onClick={() => setExpanded((value) => !value)}
                title={expanded ? "Collapse" : "Expand"}
            >
                <img src={thinkingIcon} alt="Thinking" className="thinking-header-icon" />
                <span>Thinking</span>
                <span className="thinking-chevron">▸</span>
            </button>
            {expanded && (
                <pre className="thinking-body">{text}</pre>
            )}
        </div>
    );
}

function ThinkingFluid() {
    return (
        <div className="thinking-fluid">
            <img src={thinkingIcon} alt="Thinking" className="thinking-fluid-icon" />
            <div className="thinking-shimmer" />
            <span className="thinking-text">Thinking...</span>
        </div>
    );
}

function MessageActions({
    message,
    onFork,
    onDeleteMessage,
}: {
    message: ChatMessage;
    onFork?: () => void;
    onDeleteMessage?: (id: string) => void;
}) {
    const { copied, copy } = useCopy();

    return (
        <div className="message-actions">
            <button className="msg-action" onClick={() => copy(messagePlainText(message))} title="Copy message">
                {copied ? "Copied" : "Copy"}
            </button>
            {onFork && (
                <button className="msg-action" onClick={onFork} title="Fork chat">
                    <img src={forkIcon} alt="Fork chat" />
                </button>
            )}
            {onDeleteMessage && (
                <button
                    className="msg-action msg-action-danger"
                    onClick={() => onDeleteMessage(message.id)}
                    title="Delete message"
                >
                    <img src={deleteIcon} alt="Delete message" />
                </button>
            )}
        </div>
    );
}

function messagePlainText(message: ChatMessage): string {
    const textParts: string[] = [];
    if (message.blocks) {
        for (const block of message.blocks) {
            if (block.type === "text" && block.text) textParts.push(block.text);
        }
    }
    if (message.text) textParts.push(message.text);
    return textParts.join("\n\n").trim();
}

function ToolRunCard({ run, autoExtend }: { run: ToolRun; autoExtend: boolean }) {
    const [expanded, setExpanded] = useState(autoExtend);
    const { copied, copy } = useCopy();

    const meta = TOOL_META[run.name] ?? DEFAULT_TOOL_META;
    const primary = primaryArg(run.arguments ?? "");
    const status = resolveStatus(run);
    const diffLines = run.diff ?? [];
    const hasDiff = diffLines.length > 0;
    const copyText = [
        run.output ?? "",
        ...diffLines.map((l) => `${l.type === "add" ? "+" : l.type === "del" ? "-" : " "}${l.text}`),
    ]
        .filter(Boolean)
        .join("\n");

    return (
        <div className={`tool-run ${run.state} ${expanded ? "open" : ""}`}>
            <button
                className="tool-run-header"
                onClick={() => setExpanded((value) => !value)}
                title={expanded ? "Collapse" : "Expand"}
            >
                <span className="tool-run-icon">
                    <img src={meta.icon} alt="" />
                </span>
                <span className="tool-run-name">{meta.label}</span>
                {primary && <span className="tool-run-primary">{primary}</span>}
                <span className={`tool-run-pill ${status.key}`}>{status.label}</span>
                <span className="tool-run-chevron">▸</span>
            </button>
            {expanded && (
                <>
                    <pre className="tool-run-args">{formatArgs(run.arguments ?? "")}</pre>
                    {run.output && !hasDiff && (
                        <div className="tool-run-output-block">
                            <pre className="tool-run-output">{run.output}</pre>
                            <button className="tool-run-copy" onClick={() => copy(copyText)}>
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                    )}
                    {hasDiff && (
                        <div className="tool-run-diff-block">
                            {run.output && <div className="tool-run-diff-summary">{run.output}</div>}
                            <div className="tool-run-diff">
                                {diffLines.map((line, i) => (
                                    <div key={i} className={`diff-line ${line.type}`}>
                                        <span className="diff-sign">
                                            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                                        </span>
                                        <span className="diff-text">{line.text || " "}</span>
                                    </div>
                                ))}
                            </div>
                            <button className="tool-run-copy" onClick={() => copy(copyText)}>
                                {copied ? "Copied" : "Copy"}
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function resolveStatus(run: ToolRun): { key: ToolStatusKey; label: string } {
    if (run.state === "started") return { key: "running", label: "Running" };

    if (typeof run.success === "boolean") {
        return run.success ? { key: "success", label: "Success" } : { key: "error", label: "Error" };
    }

    const output = run.output ?? "";
    if (
        output.startsWith("Error") ||
        output.startsWith("error:") ||
        output.startsWith("Failed")
    ) {
        return { key: "error", label: "Error" };
    }
    const exitMatch = output.match(/exit code: (\d+)/);
    if (exitMatch && exitMatch[1] !== "0") {
        return { key: "error", label: "Error" };
    }
    return { key: "success", label: "Success" };
}

function primaryArg(args: string): string {
    try {
        const parsed = JSON.parse(args) as Record<string, unknown>;
        for (const key of ["command", "path", "pattern", "url", "query"]) {
            const value = parsed?.[key];
            if (typeof value === "string" && value.length > 0) return value;
        }
    } catch {
        // Not JSON, fall through
    }
    return "";
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
