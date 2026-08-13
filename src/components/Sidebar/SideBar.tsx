import { useEffect, useRef, useState, type PointerEvent } from "react";
import "./SideBar.css";
import settingsIcon from "../../assets/settings.svg";
import folderCreateIcon from "../../assets/folder_create.svg";
import folderOpenIcon from "../../assets/folder_open.svg";
import folderIcon from "../../assets/folder.svg";
import addIcon from "../../assets/add.svg";
import chatIcon from "../../assets/chat.svg";
import deleteIcon from "../../assets/delete.svg";
import arrowCloseIcon from "../../assets/arrowClose.svg";
import editIcon from "../../assets/tools/edit.svg";
import type { SessionSummary } from "../../bridge";
import type { ApiProject } from "../../projects";

const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

const UNASSIGNED_KEY = "__unassigned__";

interface SidebarProps {
    onToggle: () => void;
    onResize: (width: number) => void;
    sessions: SessionSummary[];
    activeSessionId: string | null;
    onSelect: (id: string) => void;
    onNew: () => void;
    onDelete: (id: string) => void;
    onOpenSettings: () => void;
    projects: ApiProject[];
    activeProjectId: string | null;
    onSelectProject: (id: string) => void;
    onCreateProject: () => void;
    onEditProject: (project: ApiProject) => void;
    onDeleteProject: (id: string) => void;
    isStreaming?: boolean;
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
    onOpenSettings,
    projects,
    activeProjectId,
    onSelectProject,
    onCreateProject,
    onEditProject,
    onDeleteProject,
    isStreaming = false,
}: SidebarProps) {
    const draggingRef = useRef(false);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (activeProjectId) {
            setCollapsed((prev) => (prev[activeProjectId] ? { ...prev, [activeProjectId]: false } : prev));
        }
    }, [activeProjectId]);

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

    function toggle(id: string) {
        setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
    }

    const byProject = new Map<string | null, SessionSummary[]>();
    for (const session of sessions) {
        const key = session.projectId ?? null;
        const list = byProject.get(key) ?? [];
        list.push(session);
        byProject.set(key, list);
    }

    const unassigned = byProject.get(null) ?? [];

    const isNewDisabled = activeSessionId === null || isStreaming;

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

                <button
                    className={`new-chat-btn${isNewDisabled ? " active-new" : ""}`}
                    onClick={onNew}
                    disabled={isNewDisabled}
                    title={isStreaming ? "Agent is running" : activeSessionId === null ? "Currently in a new chat" : "New Chat"}
                >
                    <img src={addIcon} alt="" />
                    <span>New Chat</span>
                    <kbd className="new-chat-kbd">Ctrl N</kbd>
                </button>

                <button className="new-project-btn" onClick={onCreateProject}>
                    <img src={folderCreateIcon} alt="" />
                    <span>New Project</span>
                </button>
            </header>

            <div className="sidebar-scroll">
                {projects.length === 0 && (
                    <span className="chat-empty">No projects yet. Create one to point JustCode at a codebase.</span>
                )}

                {projects.map((project) => {
                    const chats = byProject.get(project.id) ?? [];
                    const expanded = !collapsed[project.id];
                    const active = activeProjectId === project.id;

                    return (
                        <div key={project.id} className={`project-node${active ? " active" : ""}`}>
                            <div className="project-node-header">
                                <span
                                    className={`project-chevron${expanded ? " open" : ""}`}
                                    onClick={() => toggle(project.id)}
                                    title={expanded ? "Collapse" : "Expand"}
                                >
                                    ▸
                                </span>
                                <button
                                    className="project-select"
                                    onClick={() => onSelectProject(project.id)}
                                    title="Switch to this project"
                                >
                                    <img className="project-icon" src={folderOpenIcon} alt="" />
                                    <span className="project-name">{project.name}</span>
                                    <span className="project-count">{chats.length}</span>
                                </button>
                                <span className="project-actions">
                                    <span
                                        className="project-action"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditProject(project);
                                        }}
                                        title="Edit project"
                                    >
                                        <img src={editIcon} alt="" />
                                    </span>
                                    <span
                                        className="project-action project-action-danger"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteProject(project.id);
                                        }}
                                        title="Delete project"
                                    >
                                        <img src={deleteIcon} alt="" />
                                    </span>
                                </span>
                            </div>

                            {expanded && (
                                <div className="project-chats">
                                    {chats.length === 0 && <span className="project-no-chats">No chats</span>}
                                    {chats.map((session) => (
                                        <ChatRow
                                            key={session.id}
                                            session={session}
                                            active={activeSessionId === session.id}
                                            onSelect={onSelect}
                                            onDelete={onDelete}
                                            isStreaming={isStreaming}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                {unassigned.length > 0 && (
                    <div className="project-node">
                        <div className="project-node-header">
                            <span
                                className={`project-chevron${!collapsed[UNASSIGNED_KEY] ? " open" : ""}`}
                                onClick={() => toggle(UNASSIGNED_KEY)}
                                title="Toggle"
                            >
                                ▸
                            </span>
                            <div className="project-select">
                                <img className="project-icon" src={folderIcon} alt="" />
                                <span className="project-name">No project</span>
                                <span className="project-count">{unassigned.length}</span>
                            </div>
                        </div>

                        {!collapsed[UNASSIGNED_KEY] && (
                            <div className="project-chats">
                                {unassigned.map((session) => (
                                    <ChatRow
                                        key={session.id}
                                        session={session}
                                        active={activeSessionId === session.id}
                                        onSelect={onSelect}
                                        onDelete={onDelete}
                                        isStreaming={isStreaming}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="sidebar-footer">
                <button className="settings-btn" title="Settings" onClick={onOpenSettings}>
                    <img src={settingsIcon} alt="Settings" />
                </button>
            </div>

            <div className="resize-handle" onPointerDown={handleResizeStart} />
        </aside>
    );
}

interface ChatRowProps {
    session: SessionSummary;
    active: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    isStreaming?: boolean;
}

function ChatRow({ session, active, onSelect, onDelete, isStreaming = false }: ChatRowProps) {
    return (
        <button
            className={`chat-item${active ? " active" : ""}`}
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

            {!isStreaming && (
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
            )}
        </button>
    );
}
