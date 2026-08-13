import { useState, type KeyboardEvent } from "react";
import { pickFolder, type ApiProject } from "../projects";
import type { SessionSummary } from "../bridge";
import "./ProjectsPanel.css";
import addIcon from "../assets/add.svg";
import deleteIcon from "../assets/delete.svg";
import chatIcon from "../assets/chat.svg";
import folderIcon from "../assets/folder.svg";
import folderCreateIcon from "../assets/folder_create.svg";
import editIcon from "../assets/tools/edit.svg";

interface ProjectsPanelProps {
    projects: ApiProject[];
    sessions: SessionSummary[];
    onOpenSession: (session: SessionSummary) => void;
    onDeleteSession: (id: string) => void;
    onRenameSession: (id: string, title: string) => void;
    onNewChat: (projectId: string | null) => void;
    onSaveProject: (project: ApiProject) => Promise<void>;
    onDeleteProject: (id: string) => void;
    onToast: (message: string, type?: "info" | "success" | "error") => void;
}

function formatTime(timestamp: number) {
    const minutes = Math.floor((Date.now() - timestamp) / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}

function SessionRow({
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

    return (
        <div className="project-chat-row">
            {renaming ? (
                <input
                    className="project-chat-rename-input"
                    value={value}
                    autoFocus
                    onChange={(e) => setValue(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={cancel}
                    onFocus={(e) => e.currentTarget.select()}
                />
            ) : (
                <>
                    <button
                        className="project-chat-main"
                        onClick={() => onOpenSession(session)}
                        title={session.title || "Untitled"}
                    >
                        <img className="project-chat-icon" src={chatIcon} alt="" />
                        <span className="project-chat-title">{session.title || "Untitled"}</span>
                        <span className="project-chat-sub">
                            {session.messageCount} message
                            {session.messageCount === 1 ? "" : "s"}
                        </span>
                    </button>
                    <span className="project-chat-time">{formatTime(session.updatedAt)}</span>
                    <button
                        className="project-chat-rename"
                        title="Rename chat"
                        onClick={() => {
                            setValue(session.title);
                            setRenaming(true);
                        }}
                    >
                        <img src={editIcon} alt="" />
                    </button>
                    <button
                        className="project-chat-delete"
                        title="Delete chat"
                        onClick={() => onDeleteSession(session.id)}
                    >
                        <img src={deleteIcon} alt="" />
                    </button>
                </>
            )}
        </div>
    );
}

export default function ProjectsPanel({
    projects,
    sessions,
    onOpenSession,
    onDeleteSession,
    onRenameSession,
    onNewChat,
    onSaveProject,
    onDeleteProject,
    onToast,
}: ProjectsPanelProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ApiProject | null>(null);
    const [name, setName] = useState("");
    const [path, setPath] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const projectIds = new Set(projects.map((p) => p.id));
    const byProject = new Map<string | null, SessionSummary[]>();
    for (const session of sessions) {
        const key = session.projectId && projectIds.has(session.projectId) ? session.projectId : null;
        const list = byProject.get(key) ?? [];
        list.push(session);
        byProject.set(key, list);
    }
    const unassigned = byProject.get(null) ?? [];

    function startNew() {
        setEditing(null);
        setName("");
        setPath("");
        setError(null);
        setFormOpen(true);
    }

    function startEdit(project: ApiProject) {
        setEditing(project);
        setName(project.name);
        setPath(project.path);
        setError(null);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        setEditing(null);
    }

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
            await onSaveProject(
                editing
                    ? { ...editing, name: trimmedName, path: trimmedPath }
                    : { id: crypto.randomUUID(), name: trimmedName, path: trimmedPath },
            );
            onToast(editing ? "Project updated" : "Project created", "success");
            closeForm();
        } catch (err) {
            setError(String(err));
            onToast(`Failed to save project: ${String(err)}`, "error");
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

    function toggle(id: string) {
        setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
    }

    return (
        <div className="projects-panel">
            <div className="projects-panel-scroll">
                <div className="projects-panel-header">
                    <h1 className="projects-panel-title">Projects</h1>
                    <div className="projects-panel-actions">
                        <button className="projects-action-btn" onClick={() => onNewChat(null)}>
                            <img src={addIcon} alt="" />
                            <span>New Chat</span>
                        </button>
                        <button className="projects-action-btn" onClick={startNew}>
                            <img src={folderCreateIcon} alt="" />
                            <span>New Project</span>
                        </button>
                    </div>
                </div>

                {error && <div className="projects-error">{error}</div>}

                {formOpen && (
                    <div className="project-form-card">
                        <div className="project-form-row">
                            <label className="project-field">
                                <span>Name</span>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.currentTarget.value)}
                                    placeholder="e.g. My App"
                                    autoFocus
                                />
                            </label>
                            <label className="project-field">
                                <span>Path</span>
                                <div className="project-path-row">
                                    <input
                                        value={path}
                                        onChange={(e) => setPath(e.currentTarget.value)}
                                        placeholder={"C:\\path\\to\\project"}
                                        spellCheck={false}
                                    />
                                    <button className="project-browse" onClick={handleBrowse} type="button">
                                        Browse…
                                    </button>
                                </div>
                            </label>
                        </div>
                        <div className="project-form-actions">
                            <button className="project-cancel" onClick={closeForm} disabled={saving}>
                                Cancel
                            </button>
                            <button className="project-save" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : editing ? "Save" : "Create"}
                            </button>
                        </div>
                    </div>
                )}

                {projects.length === 0 && (
                    <p className="projects-empty">
                        No projects yet. Create one to point JustCode at a codebase.
                    </p>
                )}

                {projects.map((project) => {
                    const chats = byProject.get(project.id) ?? [];
                    const isExpanded = expanded[project.id] !== false;
                    return (
                        <div key={project.id} className="project-node">
                            <div className="project-node-header">
                                <span
                                    className={`project-chevron${isExpanded ? " open" : ""}`}
                                    onClick={() => toggle(project.id)}
                                    title={isExpanded ? "Collapse" : "Expand"}
                                >
                                    ▸
                                </span>
                                <div className="project-node-info" onClick={() => toggle(project.id)}>
                                    <img className="project-icon" src={folderIcon} alt="" />
                                    <span className="project-name">{project.name}</span>
                                    <span className="project-count">{chats.length}</span>
                                </div>
                                <div className="project-node-actions">
                                    <button
                                        className="project-node-btn"
                                        onClick={() => onNewChat(project.id)}
                                        title="New chat in this project"
                                    >
                                        <img src={addIcon} alt="" />
                                    </button>
                                    <button
                                        className="project-node-btn"
                                        onClick={() => startEdit(project)}
                                        title="Edit project"
                                    >
                                        <img src={editIcon} alt="" />
                                    </button>
                                    <button
                                        className="project-node-btn project-node-danger"
                                        onClick={() => onDeleteProject(project.id)}
                                        title="Delete project"
                                    >
                                        <img src={deleteIcon} alt="" />
                                    </button>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="project-chats">
                                    {chats.length === 0 && (
                                        <span className="project-no-chats">No chats</span>
                                    )}
                                    {chats.map((session) => (
                                        <SessionRow
                                            key={session.id}
                                            session={session}
                                            onOpenSession={onOpenSession}
                                            onDeleteSession={onDeleteSession}
                                            onRenameSession={onRenameSession}
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
                                className={`project-chevron${expanded["__unassigned__"] !== false ? " open" : ""}`}
                                onClick={() => toggle("__unassigned__")}
                                title="Toggle"
                            >
                                ▸
                            </span>
                            <div
                                className="project-node-info"
                                onClick={() => toggle("__unassigned__")}
                            >
                                <img className="project-icon" src={folderIcon} alt="" />
                                <span className="project-name">No project</span>
                                <span className="project-count">{unassigned.length}</span>
                            </div>
                        </div>

                        {expanded["__unassigned__"] !== false && (
                            <div className="project-chats">
                                {unassigned.map((session) => (
                                    <SessionRow
                                        key={session.id}
                                        session={session}
                                        onOpenSession={onOpenSession}
                                        onDeleteSession={onDeleteSession}
                                        onRenameSession={onRenameSession}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
