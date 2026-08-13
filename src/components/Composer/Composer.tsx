import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { type ApiConfig } from "../../apiConfigs";
import "./Composer.css";
import sendIcon from "../../assets/send.svg";
import stopIcon from "../../assets/stop.svg";
import intelligenceIcon from "../../assets/intelligence.svg";
import thinkingIcon from "../../assets/thinking.svg";
import CustomSelect from "../CustomSelect";
import { formatTokens } from "../../tokenEstimate";

interface ComposerProps {
    onSend: (prompt: string, thinking: string, configId: string) => void;
    onStop: () => void;
    isStreaming: boolean;
    configs: ApiConfig[];
    activeConfigId: string | null;
    onSelectConfig: (id: string) => void;
    onOpenSettings: () => void;
    projectName: string | null;
    tokenUsage?: { used: number; max: number };
    draftPrompt?: string;
    onDraftChange?: (val: string) => void;
}

const FALLBACK_THINKING_OPTIONS = ["default"];
const MAX_TEXTAREA_HEIGHT = 240;

const WARN_RATIO = 0.8;
const CRITICAL_RATIO = 0.95;

export default function Composer({
    onSend,
    onStop,
    isStreaming,
    configs,
    activeConfigId,
    onSelectConfig,
    onOpenSettings,
    projectName,
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

    const usageRatio = tokenUsage && tokenUsage.max > 0 ? tokenUsage.used / tokenUsage.max : 0;
    const usageLevel =
        usageRatio >= CRITICAL_RATIO ? "critical" : usageRatio >= WARN_RATIO ? "warn" : "ok";
    const usagePct = Math.min(100, Math.round(usageRatio * 100));

    return (
        <div className="composer-box">
            <div className="composer-status">
                <img src={intelligenceIcon} alt="" className="composer-status-icon" />
                <span className="composer-status-label">Model</span>
                <span className="composer-status-value">
                    {activeConfig ? activeConfig.name || activeConfig.model : "—"}
                </span>
                <span className="composer-status-sep">·</span>
                <span className="composer-status-label">Project</span>
                <span className="composer-status-value">{projectName ?? "None"}</span>

                {tokenUsage && tokenUsage.max > 0 && (
                    <span className={`composer-tokens ${usageLevel}`}>
                        <span className="composer-status-sep">·</span>
                        <span className="composer-status-label">Context</span>
                        <span className="composer-tokens-bar-wrap" title={`${usagePct}% context token usage`}>
                            <span className="composer-tokens-bar" style={{ width: `${usagePct}%` }} />
                        </span>
                        <span className="composer-tokens-val">
                            {formatTokens(tokenUsage.used)} / {formatTokens(tokenUsage.max)}
                        </span>
                        {usageRatio >= WARN_RATIO && (
                            <span className="composer-tokens-warning">
                                {usageRatio >= CRITICAL_RATIO ? "Context full — old messages dropped" : "Context almost full"}
                            </span>
                        )}
                    </span>
                )}
            </div>

            {noConfigs ? (
                <div className="composer-empty-state">
                    <span className="composer-empty-text">
                        Add an API config to start chatting.
                    </span>
                    <button className="composer-empty-btn" onClick={onOpenSettings}>
                        Open Settings
                    </button>
                </div>
            ) : (
                <textarea
                    ref={textareaRef}
                    className="composer-input"
                    placeholder="Ask anything..."
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

            <div className="composer-actions">
                {!noConfigs && (
                    <div className="composer-tools">
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
                    </div>
                )}

                <div className="composer-spacer" />

                {isStreaming ? (
                    <button
                        className="composer-send-btn composer-stop-btn"
                        onClick={onStop}
                        title="Stop"
                    >
                        <img src={stopIcon} alt="Stop" />
                    </button>
                ) : (
                    <button
                        className="composer-send-btn"
                        onClick={handleSubmit}
                        disabled={!prompt.trim() || !activeConfigId}
                        title="Send"
                    >
                        <img src={sendIcon} alt="Send" />
                    </button>
                )}
            </div>
        </div>
    );
}

