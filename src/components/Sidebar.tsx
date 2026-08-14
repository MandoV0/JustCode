import { useState, type KeyboardEvent } from "react";
import {
    ChevronRight,
    Folder,
    FolderPlus,
    MessageSquare,
    PenSquare,
    Pencil,
    Trash2,
    X,
} from "lucide-react";
import { pickFolder, type ApiProject } from "../projects";
import type { SessionSummary } from "../bridge";
import type { TabStatus } from "../hooks/useTabs";
import "./Sidebar.css";

function formatTime(timestamp: number) {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function truncateTitle(title: string, max = 34) {
    if (title.length <= max) return title;
    return title.slice(0, max - 1).trimEnd() + "…";
}

function StatusIcon({ isLoading, lastStatus }: { isLoading: boolean; lastStatus: TabStatus }) {
    if (isLoading) return <span className="sidebar-status running" title="Running" />;
    if (lastStatus === "done") return <span className="sidebar-status done" title="Done" />;
    if (lastStatus === "cancelled") return <span className="sidebar-status cancelled" title="Cancelled" />;
    if (lastStatus === "error") return <span className="sidebar-status error" title="Error" />;
    return <span className="sidebar-status idle" />;
}

function HistoryRow({
    session,
    onOpenSession,
    onDeleteSession,
    onRenameSession,
}: {
    session: SessionSummary;
    onOpenSession: (session: SessionSummary) => void;
    onDeleteSession: (id: string) => void;
    onRenameSession: (id: string, title: string) => void;
}) {
    const [renaming, setRenaming] = useState(false);
    const [value, setValue] = useState(session.title);

    function commit() {
        const trimmed = value.trim();
        if (trimmed && trimmed !== session.title) onRenameSession(session.id, trimmed);
        setRenaming(false);
    }

    function cancel() {
        setValue(session.title);
        setRenaming(false);
    }

    function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
    }

    if (renaming) {
        return (
            <input
                className="sidebar-rename-input"
                value={value}
                autoFocus
                onChange={(e) => setValue(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                onBlur={cancel}
                onFocus={(e) => e.currentTarget.select()}
            />
        );
    }

    return (
        <div className="sidebar-chat-row">
            <button
                className="sidebar-chat-main"
                onClick={() => onOpenSession(session)}
                title={session.title || "Untitled"}
            >
                <MessageSquare className="sidebar-chat-icon" size={15} />
                <span className="sidebar-chat-title">{truncateTitle(session.title) || "Untitled"}</span>
            </button>
            <span className="sidebar-chat-time">{formatTime(session.updatedAt)}</span>
            <div className="sidebar-chat-actions">
                <button
                    className="sidebar-chat-action"
                    title="Rename chat"
                    onClick={() => {
                        setValue(session.title);
                        setRenaming(true);
                    }}
                >
                    <Pencil size={13} />
                </button>
                <button
                    className="sidebar-chat-action sidebar-chat-danger"
                    title="Delete chat"
                    onClick={() => onDeleteSession(session.id)}
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

function ProjectForm({
    editing,
    onSave,
    onCancel,
    onToast,
}: {
    editing: ApiProject | null;
    onSave: (p: ApiProject) => Promise<void>;
    onCancel: () => void;
    onToast: (message: string, type?: "info" | "success" | "error") => void;
}) {
    const [name, setName] = useState(editing?.name ?? "");
    const [path, setPath] = useState(editing?.path ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSave() {
        const trimmedName = name.trim();
        const trimmedPath = path.trim();
        if (!trimmedName || !trimmedPath) {
            setError("Name and path are required.");
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await onSave(
                editing
                    ? { ...editing, name: trimmedName, path: trimmedPath }
                    : { id: crypto.randomUUID(), name: trimmedName, path: trimmedPath },
            );
            onToast(editing ? "Project updated" : "Project created", "success");
            onCancel();
        } catch (err) {
            setError(String(err));
        } finally {
            setSaving(false);
        }
    }

    async function handleBrowse() {
        try {
            const picked = await pickFolder();
            if (!picked) return;
            setPath(picked);
            if (!name.trim()) {
                const segments = picked.split(/[\\/]/).filter(Boolean);
                setName(segments[segments.length - 1] ?? "");
            }
        } catch (err) {
            setError(String(err));
        }
    }

    return (
        <div className="sidebar-project-form">
            {error && <div className="sidebar-form-error">{error}</div>}
            <input
                className="sidebar-form-input"
                value={name}
                placeholder="Project name"
                onChange={(e) => setName(e.currentTarget.value)}
                autoFocus
            />
            <div className="sidebar-form-path-row">
                <input
                    className="sidebar-form-input"
                    value={path}
                    placeholder="C:\\path\\to\\project"
                    onChange={(e) => setPath(e.currentTarget.value)}
                    spellCheck={false}
                />
                <button className="sidebar-form-browse" onClick={handleBrowse} type="button">
                    Browse
                </button>
            </div>
            <div className="sidebar-form-actions">
                <button className="sidebar-form-cancel" onClick={onCancel} disabled={saving}>
                    Cancel
                </button>
                <button className="sidebar-form-save" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving…" : editing ? "Save" : "Create"}
                </button>
            </div>
        </div>
    );
}

interface OpenChat {
    id: string;
    sessionId: string;
    title: string;
    projectId: string | null;
    isLoading: boolean;
    lastStatus: TabStatus;
}

interface SidebarProps {
    projects: ApiProject[];
    sessions: SessionSummary[];
    activeProjectId: string | null;
    activeChatId: string | null;
    openChats: OpenChat[];
    onSelectChat: (id: string) => void;
    onCloseChat: (id: string) => void;
    onOpenSession: (session: SessionSummary) => void;
    onDeleteSession: (id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    onNewChat: (projectId: string | null) => void;
    onSaveProject: (project: ApiProject) => Promise<void>;
    onDeleteProject: (id: string) => void;
    onSelectProject: (id: string | null) => void;
    onToast: (message: string, type?: "info" | "success" | "error") => void;
}

export default function Sidebar({
    projects,
    sessions,
    activeProjectId,
    activeChatId,
    openChats,
    onSelectChat,
    onCloseChat,
    onOpenSession,
    onDeleteSession,
    onRenameSession,
    onNewChat,
    onSaveProject,
    onDeleteProject,
    onSelectProject,
    onToast,
}: SidebarProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ApiProject | null>(null);
    const [projectsExpanded, setProjectsExpanded] = useState(true);

    const openIds = new Set(openChats.map((c) => c.sessionId));
    const history = sessions.filter((s) => !openIds.has(s.id));

    return (
        <aside className="sidebar">
            <div className="sidebar-nav">
                <button className="sidebar-nav-item" onClick={() => onNewChat(null)}>
                    <PenSquare size={16} />
                    <span>New chat</span>
                </button>
            </div>

            <div className="sidebar-scroll">
                <div className="sidebar-section">
                    <div className="sidebar-section-head">
                        <span className="sidebar-section-label">Chats</span>
                        <button
                            className="sidebar-section-add"
                            title="New chat"
                            onClick={() => onNewChat(null)}
                        >
                            <PenSquare size={14} />
                        </button>
                    </div>

                    {openChats.length === 0 && history.length === 0 && (
                        <span className="sidebar-empty">No chats yet.</span>
                    )}

                    {openChats.map((chat) => (
                        <div
                            key={chat.id}
                            className={`sidebar-chat-row open${chat.id === activeChatId ? " active" : ""}`}
                            onClick={() => onSelectChat(chat.id)}
                            title={chat.title || "New chat"}
                        >
                            <span className="sidebar-status-wrap">
                                <StatusIcon isLoading={chat.isLoading} lastStatus={chat.lastStatus} />
                            </span>
                            <button className="sidebar-chat-main">
                                <span className="sidebar-chat-title">{truncateTitle(chat.title) || "New chat"}</span>
                            </button>
                            <button
                                className="sidebar-chat-action"
                                title="Close chat"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCloseChat(chat.id);
                                }}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}

                    {history.length > 0 && (
                        <>
                            <div className="sidebar-subhead">History</div>
                            {history.map((session) => (
                                <HistoryRow
                                    key={session.id}
                                    session={session}
                                    onOpenSession={onOpenSession}
                                    onDeleteSession={onDeleteSession}
                                    onRenameSession={onRenameSession}
                                />
                            ))}
                        </>
                    )}
                </div>

                <div className="sidebar-section">
                    <div className="sidebar-section-head">
                        <span
                            className="sidebar-section-toggle"
                            onClick={() => setProjectsExpanded((v) => !v)}
                        >
                            <ChevronRight
                                className={`sidebar-chevron${projectsExpanded ? " open" : ""}`}
                                size={13}
                            />
                            <span className="sidebar-section-label">Projects</span>
                        </span>
                        <button
                            className="sidebar-section-add"
                            title="New project"
                            onClick={() => {
                                setEditing(null);
                                setFormOpen(true);
                            }}
                        >
                            <FolderPlus size={14} />
                        </button>
                    </div>

                    {formOpen && (
                        <ProjectForm
                            editing={editing}
                            onSave={async (p) => {
                                await onSaveProject(p);
                            }}
                            onCancel={() => {
                                setFormOpen(false);
                                setEditing(null);
                            }}
                            onToast={onToast}
                        />
                    )}

                    {projectsExpanded && (
                        <>
                            {projects.length === 0 && !formOpen && (
                                <span className="sidebar-empty">No projects yet.</span>
                            )}

                            {projects.map((project) => {
                                const isActive = activeProjectId === project.id;
                                return (
                                    <div key={project.id} className="sidebar-project">
                                        <div
                                            className={`sidebar-project-header${isActive ? " active" : ""}`}
                                            onClick={() => onSelectProject(project.id)}
                                            title={project.name}
                                        >
                                            <Folder className="sidebar-folder-icon" size={16} />
                                            <span className="sidebar-project-name">{project.name}</span>
                                            <span className="sidebar-project-count">
                                                {sessions.filter((s) => s.projectId === project.id).length}
                                            </span>
                                            <button
                                                className="sidebar-project-delete"
                                                title="Delete project"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteProject(project.id);
                                                }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
