import { useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke, invokeStream, type Session, type SessionSummary, type ToolStatus } from "../bridge";
import "../styles/tokens.css";
import "./AppShell.css";
import Composer from "./Composer/Composer";
import ChatView, { type ChatMessage, type ToolRun } from "./ChatView/ChatView";
import Sidebar from "./Sidebar/SideBar";
import arrowOpenIcon from "../assets/arrowOpen.svg";

export default function AppShell() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(272);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

    const sessionIdRef = useRef<string>(crypto.randomUUID()); // Stable per chat SessionID, resets on "New Chat"
    const sessionCreatedAtRef = useRef<number>(0);
    const sessionTitleRef = useRef<string>("");
    const toolRunsRef = useRef<ToolRun[]>([]);

    const shellStyle = {
        gridTemplateColumns: sidebarOpen ? "var(--sidebar-width) 1fr" : "1fr",
        "--sidebar-width": `${sidebarWidth}px`,
    } as CSSProperties;

    useEffect(() => {
        refreshSessions();
    }, []);

    async function refreshSessions() {
        try {
            setSessions(await invoke<SessionSummary[]>("list_sessions"));
        } catch (err) {
            console.error("list_sessions failed", err);
        }
    }

    async function persistSession(finalMessages: ChatMessage[]) {
        const now = Date.now();
        if (sessionCreatedAtRef.current === 0) {
            sessionCreatedAtRef.current = now;
        }

        await invoke("save_session", {
            session: {
                id: sessionIdRef.current,
                title: sessionTitleRef.current,
                createdAt: sessionCreatedAtRef.current,
                updatedAt: now,
                messages: finalMessages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    text: m.text,
                })),
            },
        });
        setActiveSessionId((prev) => prev ?? sessionIdRef.current);
        await refreshSessions();
    }

    async function handleSelectSession(id: string) {
        try {
            const session = await invoke<Session>("load_session", { id });
            setMessages(
                session.messages.map((m) => ({
                    id: m.id || crypto.randomUUID(),
                    role:
                        m.role === "user"
                            ? ("user" as const)
                            : ("assistant" as const),
                    text: m.text,
                })),
            );
            sessionIdRef.current = id;
            sessionCreatedAtRef.current = session.createdAt;
            sessionTitleRef.current = session.title;
            setActiveSessionId(id);
            setError(null);
        } catch (err) {
            console.error("load_session failed", err);
        }
    }

    async function handleDeleteSession(id: string) {
        if (!window.confirm("Delete this chat?")) {
            return;
        }
        try {
            await invoke("delete_session", { id });
            await refreshSessions();
            if (activeSessionId === id) {
                handleNewChat();
            }
        } catch (err) {
            console.error("delete_session failed", err);
        }
    }

    function handleNewChat() {
        sessionIdRef.current = crypto.randomUUID();
        sessionCreatedAtRef.current = 0;
        sessionTitleRef.current = "";
        setActiveSessionId(null);
        setMessages([]);
        setError(null);
    }

    async function handleSend(prompt: string, thinking: string) {
        const history = messages.map((m) => ({
            role: m.role,
            text: m.text,
        }));

        if (!sessionTitleRef.current) {
            sessionTitleRef.current = prompt;
        }

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            text: prompt,
        };

        const next: ChatMessage[] = [...messages, userMessage];
        const assistantId = crypto.randomUUID();
        const assistantMessage: ChatMessage = {
            id: assistantId,
            role: "assistant",
            text: "",
        };

        setMessages([...next, assistantMessage]);
        toolRunsRef.current = [];
        setIsLoading(true);
        setError(null);

        try {
            let reply = "";
            const result = await invokeStream<"done" | "cancelled">("chat_stream", { history, prompt, thinking }, {
                onChunk: (chunk) => {
                    reply += String(chunk);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId ? { ...m, text: reply } : m,
                        ),
                    );
                },
                onToolStatus: (status) => {
                    toolRunsRef.current = applyToolStatus(toolRunsRef.current, status);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId
                                ? { ...m, toolRuns: toolRunsRef.current }
                                : m,
                        ),
                    );
                },
            });
            const final: ChatMessage[] = [
                ...next,
                {
                    ...assistantMessage,
                    text: reply,
                    interrupted: result === "cancelled",
                    toolRuns: toolRunsRef.current,
                },
            ];
            setMessages(final);
            await persistSession(final);
        } catch (err) {
            setError(String(err));
            await persistSession(next);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleStop() {
        try {
            await invoke("cancel_stream");
        } catch (err) {
            console.error("cancel_stream failed", err);
        }
    }

    function applyToolStatus(prev: ToolRun[], status: ToolStatus): ToolRun[] {
        if (status.state === "started") {
            return [...prev, { ...status, id: toolRunsRef.current.length }];
        }

        const index = findRunningRun(prev, status.name);
        if (index === -1) return prev;

        const next = [...prev];
        next[index] = { ...next[index], state: "done", output: status.output };
        return next;
    }

    function findRunningRun(runs: ToolRun[], name: string): number {
        for (let i = runs.length - 1; i >= 0; i--) {
            if (runs[i].name === name && runs[i].state === "started") return i;
        }
        return -1;
    }

    return (
        <div className="app-shell" style={shellStyle}>
            {sidebarOpen && (
                <Sidebar
                    onToggle={() => setSidebarOpen(false)}
                    onResize={setSidebarWidth}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelect={handleSelectSession}
                    onDelete={handleDeleteSession}
                    onNew={handleNewChat}
                />
            )}

            <main className="main">
                {!sidebarOpen && (
                    <button
                        className="sidebar-reopen"
                        onClick={() => setSidebarOpen(true)}
                        title="Expand sidebar"
                    >
                        <img src={arrowOpenIcon} alt="Expand sidebar" />
                    </button>
                )}
                <ChatView
                    messages={messages}
                    isLoading={isLoading}
                    error={error}
                />
                <Composer
                    onSend={handleSend}
                    onStop={handleStop}
                    isStreaming={isLoading}
                />
            </main>
        </div>
    );
}
