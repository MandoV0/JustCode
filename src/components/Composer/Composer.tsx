import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Hand, Paperclip, Square } from "lucide-react";
import { type ApiConfig } from "../../apiConfigs";
import { type ApiProject } from "../../projects";
import "./Composer.css";
import intelligenceIcon from "../../assets/intelligence.svg";
import thinkingIcon from "../../assets/thinking.svg";
import folderOpenIcon from "../../assets/folder_open.svg";
import CustomSelect from "../CustomSelect";
import { formatTokens } from "../../tokenEstimate";

interface ComposerProps {
    isActive?: boolean;
    onSend: (prompt: string, thinking: string, configId: string) => void;
    onStop: () => void;
    isStreaming: boolean;
    configs: ApiConfig[];
    activeConfigId: string | null;
    onSelectConfig: (id: string) => void;
    onOpenSettings: () => void;
    projectName: string | null;
    projects: ApiProject[];
    activeProjectId: string | null;
    onSelectProject: (id: string | null) => void;
    approvalEnabled: boolean;
    onApprovalChange: (enabled: boolean) => void;
    tokenUsage?: { used: number; max: number };
    draftPrompt?: string;
    onDraftChange?: (val: string) => void;
}

const FALLBACK_THINKING_OPTIONS = ["default"];
const MAX_TEXTAREA_HEIGHT = 200;

const WARN_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;

export default function Composer({
    isActive = false,
    onSend,
    onStop,
    isStreaming,
    configs,
    activeConfigId,
    onSelectConfig,
    onOpenSettings,
    projectName,
    projects,
    activeProjectId,
    onSelectProject,
    approvalEnabled,
    onApprovalChange,
    tokenUsage,
    draftPrompt,
    onDraftChange,
}: ComposerProps) {
    const [prompt, setPrompt] = useState("");
    const [thinking, setThinking] = useState("default");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
    const noConfigs = configs.length === 0;
    const thinkingOptions =
        activeConfig && Array.isArray(activeConfig.thinkingOptions) && activeConfig.thinkingOptions.length > 0
            ? activeConfig.thinkingOptions
            : FALLBACK_THINKING_OPTIONS;

    const effectiveThinking = thinkingOptions.includes(thinking) ? thinking : thinkingOptions[0];

    useEffect(() => {
        if (draftPrompt !== undefined) {
            setPrompt(draftPrompt);
            if (draftPrompt && textareaRef.current) {
                textareaRef.current.focus();
            }
        }
    }, [draftPrompt]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
    }, [prompt]);

    useEffect(() => {
        if (!thinkingOptions.includes(thinking)) setThinking(thinkingOptions[0]);
    }, [activeConfigId, thinkingOptions, thinking]);

    useEffect(() => {
        if (!isActive) return;
        function onFocusRequest() {
            textareaRef.current?.focus();
        }
        window.addEventListener("justcode:focus-composer", onFocusRequest);
        return () => window.removeEventListener("justcode:focus-composer", onFocusRequest);
    }, [isActive]);

    function handleSubmit() {
        const trimmed = prompt.trim();
        if (!trimmed || isStreaming || !activeConfigId) return;
        onSend(trimmed, effectiveThinking, activeConfigId);
        setPrompt("");
        onDraftChange?.("");
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    const modelSelectOptions = configs.map((config) => ({
        value: config.id,
        label: config.name || config.model,
        sublabel: config.name ? config.model : undefined,
    }));

    const thinkingSelectOptions = thinkingOptions.map((option) => ({
        value: option,
        label: option,
    }));

    const projectSelectOptions = projects.map((p) => ({ value: p.id, label: p.name }));

    const usageRatio = tokenUsage && tokenUsage.max > 0 ? tokenUsage.used / tokenUsage.max : 0;
    const usageLevel =
        usageRatio >= CRITICAL_RATIO ? "critical" : usageRatio >= WARN_RATIO ? "warn" : "ok";
    const usagePct = Math.min(100, Math.round(usageRatio * 100));

    const placeholder = "Work with JustCode…";

    return (
        <div className="composer-wrap">
            <div className="composer-context-row">
                <CustomSelect
                    icon={folderOpenIcon}
                    value={activeProjectId ?? ""}
                    onChange={(id) => onSelectProject(id || null)}
                    options={projectSelectOptions}
                    placeholder={projectName ?? "Choose project"}
                    title="Workspace context"
                    direction="up"
                />
                {usageRatio > 0 && (
                    <span className={`composer-meter ${usageLevel}`} title={`${usagePct}% context token usage`}>
                        <span className="composer-meter-bar">
                            <span className="composer-meter-fill" style={{ width: `${usagePct}%` }} />
                        </span>
                        <span className="composer-meter-val">
                            {formatTokens(tokenUsage?.used ?? 0)} / {formatTokens(tokenUsage?.max ?? 0)}
                        </span>
                    </span>
                )}
            </div>

            <div className="composer-box">
                {noConfigs ? (
                    <div className="composer-empty-state">
                        <span className="composer-empty-text">Add an API config to start working.</span>
                        <button className="composer-empty-btn" onClick={onOpenSettings}>
                            Open Settings
                        </button>
                    </div>
                ) : (
                    <textarea
                        ref={textareaRef}
                        className="composer-input"
                        placeholder={placeholder}
                        value={prompt}
                        onChange={(e) => {
                            const val = e.currentTarget.value;
                            setPrompt(val);
                            onDraftChange?.(val);
                        }}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                    />
                )}

                <div className="composer-toolbar">
                    <div className="composer-toolbar-left">
                        <button
                            className="composer-icon-btn"
                            title="Attach files (coming soon)"
                            onClick={() => {}}
                        >
                            <Paperclip size={16} />
                        </button>

                        <button
                            className={`composer-approval${approvalEnabled ? " enabled" : ""}`}
                            onClick={() => onApprovalChange(!approvalEnabled)}
                            title={
                                approvalEnabled
                                    ? "The agent will ask before running commands or editing files."
                                    : "The agent runs freely without asking."
                            }
                        >
                            <Hand size={14} />
                            <span>Ask for approval</span>
                            <span className={`composer-approval-switch${approvalEnabled ? " on" : ""}`}>
                                <span className="composer-approval-knob" />
                            </span>
                        </button>
                    </div>

                    <div className="composer-toolbar-right">
                        {!noConfigs && (
                            <>
                                <CustomSelect
                                    icon={intelligenceIcon}
                                    value={activeConfigId ?? ""}
                                    onChange={(id) => onSelectConfig(id)}
                                    options={modelSelectOptions}
                                    placeholder="No configs"
                                    title="Model / API config"
                                    direction="up"
                                />

                                {thinkingOptions.length > 0 && (
                                    <CustomSelect
                                        icon={thinkingIcon}
                                        value={effectiveThinking}
                                        onChange={(val) => setThinking(val)}
                                        options={thinkingSelectOptions}
                                        title="Thinking effort"
                                        direction="up"
                                    />
                                )}
                            </>
                        )}

                        {isStreaming ? (
                            <button
                                className="composer-send-btn composer-stop-btn"
                                onClick={onStop}
                                title="Stop"
                            >
                                <Square size={15} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                className={`composer-send-btn${prompt.trim() && activeConfigId ? " ready" : ""}`}
                                onClick={handleSubmit}
                                disabled={!prompt.trim() || !activeConfigId}
                                title="Send"
                            >
                                <ArrowUp size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
