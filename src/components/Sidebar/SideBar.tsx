import { useEffect, useRef, type PointerEvent } from "react";
import "./SideBar.css";
import settingsIcon from "../../assets/settings.svg";
import addIcon from "../../assets/add.svg";
import chatIcon from "../../assets/chat.svg";
import deleteIcon from "../../assets/delete.svg";
import arrowCloseIcon from "../../assets/arrowClose.svg";
import type { SessionSummary } from "../../bridge";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

interface SidebarProps {
    onToggle: () => void;
    onResize: (width: number) => void;
    sessions: SessionSummary[];
    activeSessionId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
}

function formatTime(timestamp: number) {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

export default function Sidebar({
    onToggle,
    onResize,
    sessions,
    activeSessionId,
    onSelect,
    onNew,
    onDelete,
}: SidebarProps) {
    const draggingRef = useRef(false);

    useEffect(() => {
        function handleMove(e: globalThis.PointerEvent) {
            if (!draggingRef.current) return;
            onResize(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
        }
        function handleUp() {
            draggingRef.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
        return () => {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
        };
    }, [onResize]);

    function handleResizeStart(e: PointerEvent) {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }

    return (
        <aside className="sidebar">
            <header className="sidebar-header">
                <div className="brand">
                    <span className="brand-name">JustCode</span>
                    <button
                        className="collapse-btn"
                        onClick={onToggle}
                        title="Collapse sidebar"
                    >
                        <img src={arrowCloseIcon} alt="Collapse sidebar" />
                    </button>
                </div>

                <button className="new-chat-btn" onClick={onNew}>
                    <img src={addIcon} alt="" />
                    <span>New Chat</span>
                    <kbd className="new-chat-kbd">Ctrl N</kbd>
                </button>
            </header>

            <div className="sidebar-section">
                <span className="sidebar-title">Chats</span>

                <div className="chat-list">
                    {sessions.length === 0 && (
                        <span className="chat-empty">No chats yet</span>
                    )}
                    {sessions.map((session) => (
                        <button
                            key={session.id}
                            className={`chat-item${activeSessionId === session.id ? " active" : ""}`}
                            onClick={() => onSelect(session.id)}
                        >
                            <img className="chat-icon" src={chatIcon} alt="" />

                            <span className="chat-text">
                                <span className="chat-title">{session.title || "Untitled"}</span>
                                <span className="chat-sub">
                                    {session.messageCount} message{session.messageCount === 1 ? "" : "s"}
                                </span>
                            </span>

                            <span className="chat-time">{formatTime(session.updatedAt)}</span>

                            <span
                                className="chat-delete"
                                title="Delete chat"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(session.id);
                                }}
                            >
                                <img src={deleteIcon} alt="" />
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="sidebar-footer">
                <button className="settings-btn" title="Settings">
                    <img src={settingsIcon} alt="Settings" />
                </button>
            </div>

            <div className="resize-handle" onPointerDown={handleResizeStart} />
        </aside>
    );
}
