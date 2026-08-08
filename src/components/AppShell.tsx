import { useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke, type Session, type SessionSummary } from "../bridge";
import "../styles/tokens.css";
import "./AppShell.css";
import Composer from "./Composer/Composer";
import ChatView, { type ChatMessage } from "./ChatView/ChatView";
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
    const sessionTitleRef = useRef<string>("");

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
        await invoke("save_session", {
            session: {
                id: sessionIdRef.current,
                title: sessionTitleRef.current,
                createdAt: 0, // set once on first save, keep stable after
                updatedAt: Date.now(),
                messages: finalMessages.map((m) => ({
                    id: crypto.randomUUID(),
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
                    role:
                        m.role === "user"
                            ? ("user" as const)
                            : ("assistant" as const),
                    text: m.text,
                })),
            );
            sessionIdRef.current = id;
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
        sessionTitleRef.current = "";
        setActiveSessionId(null);
        setMessages([]);
        setError(null);
    }

    async function handleSend(prompt: string) {
        const history = messages.map((m) => ({
            role: m.role,
            text: m.text,
        }));

        if (!sessionTitleRef.current) {
            sessionTitleRef.current = prompt;
        }

        const next: ChatMessage[] = [
            ...messages,
            { role: "user", text: prompt },
        ];
        setMessages(next);
        setIsLoading(true);
        setError(null);

        try {
            const reply = await invoke<string>("chat_with_gemini", {
                history,
                prompt,
            });
            const final: ChatMessage[] = [
                ...next,
                { role: "assistant", text: reply },
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
                <Composer onSend={handleSend} disabled={isLoading} />
            </main>
        </div>
    );
}
