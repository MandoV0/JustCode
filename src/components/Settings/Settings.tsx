import { useEffect, useState } from "react";
import {
    deleteApiConfig,
    saveApiConfig,
    setActiveApiConfig,
    type ApiConfig,
} from "../../apiConfigs";
import "./Settings.css";
import addIcon from "../../assets/add.svg";
import deleteIcon from "../../assets/delete.svg";
import intelligenceIcon from "../../assets/intelligence.svg";
import thinkingIcon from "../../assets/thinking.svg";
import cancelIcon from "../../assets/cancel.svg";
import checkIcon from "../../assets/check.svg";

interface SettingsModalProps {
    open: boolean;
    onClose: () => void;
    configs: ApiConfig[];
    activeConfigId: string | null;
    onChanged: () => void;
    toolAutoExtend: boolean;
    onToolAutoExtendChange: (value: boolean) => void;
    yoloMode: boolean;
    onYoloChange: (value: boolean) => void;
    askConfirm: (title: string, message: string, onConfirm: () => void) => void;
    onToast: (message: string, type?: "info" | "success" | "error") => void;
}

const DEFAULT_THINKING = "default, low, high, max";
const DEFAULT_BASE_URL = "https://api.openai.com";
const MIN_CONTEXT_TOKENS = 2000;

const EMPTY_CONFIG: ApiConfig = {
    id: "",
    name: "",
    baseUrl: DEFAULT_BASE_URL,
    apiKey: "",
    model: "",
    enableThinking: true,
    strictMode: false,
    thinkingOptions: DEFAULT_THINKING.split(",").map((s) => s.trim()),
    maxContextTokens: 64000,
};

export default function SettingsModal({ open, onClose, configs, activeConfigId, onChanged, toolAutoExtend, onToolAutoExtendChange, yoloMode, onYoloChange, askConfirm, onToast }: SettingsModalProps) {
    const [editing, setEditing] = useState<ApiConfig | "new" | null>(null);
    const [form, setForm] = useState<ApiConfig>(EMPTY_CONFIG);
    const [thinkingText, setThinkingText] = useState(DEFAULT_THINKING);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) setEditing(null);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    function startAdd() {
        setForm({ ...EMPTY_CONFIG, id: crypto.randomUUID() });
        setThinkingText(DEFAULT_THINKING);
        setError(null);
        setEditing("new");
    }

    function startEdit(config: ApiConfig) {
        setForm({ ...config });
        setThinkingText((config.thinkingOptions ?? []).join(", "));
        setError(null);
        setEditing(config);
    }

    async function handleSave() {
        const name = form.name.trim();
        const baseUrl = form.baseUrl.trim();
        const model = form.model.trim();
        if (!name || !baseUrl || !model) {
            setError("Name, URL and Model are required.");
            return;
        }

        const thinkingOptions = thinkingText
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

        const maxContextTokens = Math.max(MIN_CONTEXT_TOKENS, Number(form.maxContextTokens) || MIN_CONTEXT_TOKENS);

        setSaving(true);
        setError(null);
        try {
            await saveApiConfig({ ...form, name, baseUrl, model, thinkingOptions, maxContextTokens });
            onChanged();
            setEditing(null);
            onToast("API config saved", "success");
        } catch (err) {
            setError(String(err));
            onToast(`Failed to save config: ${String(err)}`, "error");
        } finally {
            setSaving(false);
        }
    }

    function handleDelete(config: ApiConfig) {
        askConfirm("Delete API config", `Delete "${config.name || config.model}"?`, async () => {
            try {
                await deleteApiConfig(config.id);
                onChanged();
                onToast("API config deleted", "success");
            } catch (err) {
                setError(String(err));
                onToast(`Failed to delete config: ${String(err)}`, "error");
            }
        });
    }

    async function handleSetActive(config: ApiConfig) {
        try {
            await setActiveApiConfig(config.id);
            onChanged();
        } catch (err) {
            setError(String(err));
        }
    }

    return (
        <div className="settings-backdrop" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <header className="settings-header">
                    <h2 className="settings-title">Settings</h2>
                    <button className="settings-close" onClick={onClose} title="Close">
                        <img src={cancelIcon} alt="Close" />
                    </button>
                </header>

                {error && <div className="settings-error">{error}</div>}

                {editing === null ? (
                    <div className="settings-list">
                        <div className="settings-section">
                            <span className="settings-section-title">General</span>
                            <label className="settings-checkbox settings-general-item">
                                <input
                                    type="checkbox"
                                    checked={toolAutoExtend}
                                    onChange={(e) => onToolAutoExtendChange(e.currentTarget.checked)}
                                />
                                <span>
                                    <span className="settings-general-label">Auto-extend tool calls</span>
                                    <span className="settings-general-hint">
                                        Expand tool call cards automatically when they run
                                    </span>
                                </span>
                            </label>
                            <label className="settings-checkbox settings-general-item">
                                <input
                                    type="checkbox"
                                    checked={yoloMode}
                                    onChange={(e) => onYoloChange(e.currentTarget.checked)}
                                />
                                <span>
                                    <span className="settings-general-label">YOLO mode</span>
                                    <span className="settings-general-hint">
                                        Auto-approve all tool calls without asking (e.g. bash, write, edit)
                                    </span>
                                </span>
                            </label>
                        </div>

                        <div className="settings-section">
                            <span className="settings-section-title">API Configs</span>
                            <button className="settings-add" onClick={startAdd}>
                                <img src={addIcon} alt="" />
                                <span>Add API Config</span>
                            </button>

                            {configs.length === 0 && (
                                <p className="settings-empty">
                                    No API configs yet. Add one to start chatting.
                                </p>
                            )}

                            {configs.map((config) => (
                                <div
                                    key={config.id}
                                    className={`settings-item${activeConfigId === config.id ? " active" : ""}`}
                                >
                                    <div className="settings-item-info">
                                        <span className="settings-item-name">{config.name || config.model || "Untitled"}</span>
                                        <span className="settings-item-model">
                                            <img src={intelligenceIcon} alt="" className="settings-inline-icon" />
                                            {config.model}
                                        </span>
                                        <span className="settings-item-url">{config.baseUrl}</span>
                                    </div>

                                    <div className="settings-item-actions">
                                        {activeConfigId === config.id ? (
                                            <span className="settings-item-active">
                                                <img src={checkIcon} alt="" className="settings-inline-icon" />
                                                Active
                                            </span>
                                        ) : (
                                            <button className="settings-action-btn" onClick={() => handleSetActive(config)}>
                                                Use
                                            </button>
                                        )}
                                        <button className="settings-action-btn" onClick={() => startEdit(config)}>
                                            Edit
                                        </button>
                                        <button
                                            className="settings-action-btn settings-action-danger"
                                            onClick={() => handleDelete(config)}
                                            title="Delete"
                                        >
                                            <img src={deleteIcon} alt="Delete" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="settings-form">
                        <label className="settings-field">
                            <span>Name</span>
                            <input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
                                placeholder="e.g. DeepSeek, OpenAI, Local Ollama"
                            />
                        </label>

                        <label className="settings-field">
                            <span>Base URL</span>
                            <input
                                value={form.baseUrl}
                                onChange={(e) => setForm({ ...form, baseUrl: e.currentTarget.value })}
                                placeholder="https://api.deepseek.com"
                            />
                        </label>

                        <label className="settings-field">
                            <span>API Key</span>
                            <input
                                type="password"
                                value={form.apiKey}
                                onChange={(e) => setForm({ ...form, apiKey: e.currentTarget.value })}
                                placeholder="sk-..."
                                autoComplete="off"
                            />
                        </label>

                        <label className="settings-field">
                            <span className="settings-field-title">
                                <img src={intelligenceIcon} alt="" className="settings-inline-icon" />
                                Model
                            </span>
                            <input
                                value={form.model}
                                onChange={(e) => setForm({ ...form, model: e.currentTarget.value })}
                                placeholder="deepseek-v4-flash"
                            />
                        </label>

                        <label className="settings-field">
                            <span className="settings-field-title">
                                <img src={thinkingIcon} alt="" className="settings-inline-icon" />
                                Thinking Options (comma separated)
                            </span>
                            <input
                                value={thinkingText}
                                onChange={(e) => setThinkingText(e.currentTarget.value)}
                                placeholder="default, low, high, max"
                            />
                        </label>

                        <label className="settings-field">
                            <span>Max Context Tokens</span>
                            <input
                                type="number"
                                value={form.maxContextTokens}
                                onChange={(e) =>
                                    setForm({ ...form, maxContextTokens: Number(e.currentTarget.value) })
                                }
                                placeholder="64000"
                            />
                            <span className="settings-hint">
                                Approximate token budget for chat history. When exceeded, oldest
                                messages are dropped.
                            </span>
                        </label>

                        <div className="settings-checkboxes">
                            <label className="settings-checkbox">
                                <input
                                    type="checkbox"
                                    checked={form.enableThinking}
                                    onChange={(e) => setForm({ ...form, enableThinking: e.currentTarget.checked })}
                                />
                                <span>
                                    <img src={thinkingIcon} alt="" className="settings-inline-icon" />
                                    Enable thinking
                                </span>
                            </label>
                            <label className="settings-checkbox">
                                <input
                                    type="checkbox"
                                    checked={form.strictMode}
                                    onChange={(e) => setForm({ ...form, strictMode: e.currentTarget.checked })}
                                />
                                <span>Strict mode (tool schemas)</span>
                            </label>
                        </div>

                        <div className="settings-form-actions">
                            <button className="settings-cancel" onClick={() => setEditing(null)} disabled={saving}>
                                Cancel
                            </button>
                            <button className="settings-save" onClick={handleSave} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
