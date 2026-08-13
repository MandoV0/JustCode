import { useEffect, useState } from "react";
import {
    deleteProject,
    pickFolder,
    saveProject,
    setActiveProject,
    type ApiProject,
} from "../../projects";
import "./ProjectModal.css";
import addIcon from "../../assets/add.svg";
import deleteIcon from "../../assets/delete.svg";
import cancelIcon from "../../assets/cancel.svg";
import checkIcon from "../../assets/check.svg";

interface ProjectModalProps {
    open: boolean;
    onClose: () => void;
    projects: ApiProject[];
    activeProjectId: string | null;
    onChanged: () => void;
    editProject: ApiProject | null;
    onEditDone: () => void;
    askConfirm: (title: string, message: string, onConfirm: () => void) => void;
    onToast: (message: string, type?: "info" | "success" | "error") => void;
}

export default function ProjectModal({
    open,
    onClose,
    projects,
    activeProjectId,
    onChanged,
    editProject,
    onEditDone,
    askConfirm,
    onToast,
}: ProjectModalProps) {
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ApiProject | null>(null);
    const [name, setName] = useState("");
    const [path, setPath] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setFormOpen(false);
            setEditing(null);
            setName("");
            setPath("");
            setError(null);
            return;
        }

        if (editProject) {
            setEditing(editProject);
            setName(editProject.name);
            setPath(editProject.path);
            setFormOpen(true);
        } else {
            setFormOpen(false);
            setName("");
            setPath("");
        }
        setError(null);
    }, [open, editProject]);

    useEffect(() => {
        if (!open) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    function startNew() {
        setEditing(null);
        setName("");
        setPath("");
        setError(null);
        setFormOpen(true);
    }

    function closeForm() {
        setFormOpen(false);
        onEditDone();
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
            await saveProject(
                editing
                    ? { ...editing, name: trimmedName, path: trimmedPath }
                    : { id: crypto.randomUUID(), name: trimmedName, path: trimmedPath },
            );
            onChanged();
            closeForm();
            onToast(editing ? "Project updated" : "Project created", "success");
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

    async function handleUse(project: ApiProject) {
        try {
            await setActiveProject(project.id);
            onChanged();
        } catch (err) {
            setError(String(err));
        }
    }

    async function handleDelete(project: ApiProject) {
        askConfirm("Delete project", `Delete "${project.name}"?`, async () => {
            try {
                await deleteProject(project.id);
                onChanged();
                onToast("Project deleted", "success");
            } catch (err) {
                setError(String(err));
                onToast(`Failed to delete project: ${String(err)}`, "error");
            }
        });
    }

    return (
        <div className="project-backdrop" onClick={onClose}>
            <div className="project-modal" onClick={(e) => e.stopPropagation()}>
                <header className="project-header">
                    <h2 className="project-title">Projects</h2>
                    <button className="project-close" onClick={onClose} title="Close">
                        <img src={cancelIcon} alt="Close" />
                    </button>
                </header>

                {error && <div className="project-error">{error}</div>}

                {!formOpen ? (
                    <div className="project-list">
                        <button className="project-add" onClick={startNew}>
                            <img src={addIcon} alt="" />
                            <span>New Project</span>
                        </button>

                        {projects.length === 0 && (
                            <p className="project-empty">
                                No projects yet. Create one to point JustCode at a codebase.
                            </p>
                        )}

                        {projects.map((project) => (
                            <div
                                key={project.id}
                                className={`project-item${activeProjectId === project.id ? " active" : ""}`}
                            >
                                <div className="project-item-info">
                                    <span className="project-item-name">{project.name}</span>
                                    <span className="project-item-path">{project.path}</span>
                                </div>

                                <div className="project-item-actions">
                                    {activeProjectId === project.id ? (
                                        <span className="project-item-active">
                                            <img src={checkIcon} alt="" className="project-inline-icon" />
                                            Active
                                        </span>
                                    ) : (
                                        <button className="project-action" onClick={() => handleUse(project)}>
                                            Use
                                        </button>
                                    )}
                                    <button className="project-action" onClick={() => {
                                        setEditing(project);
                                        setName(project.name);
                                        setPath(project.path);
                                        setError(null);
                                        setFormOpen(true);
                                    }}>
                                        Edit
                                    </button>
                                    <button
                                        className="project-action project-action-danger"
                                        onClick={() => handleDelete(project)}
                                        title="Delete"
                                    >
                                        <img src={deleteIcon} alt="Delete" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="project-form">
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
            </div>
        </div>
    );
}
