import { useState, type KeyboardEvent } from "react";
import "./Composer.css";
import sendIcon from "../../assets/send.svg";
import stopIcon from "../../assets/stop.svg";
import attachFileIcon from "../../assets/attach_file.svg";

interface ComposerProps {
    onSend: (prompt: string, thinking: string) => void;
    onStop: () => void;
    isStreaming: boolean;
}

const THINKING_OPTIONS = [
    { value: "default", label: "Default" },
    { value: "low", label: "Low" },
    { value: "high", label: "High" },
    { value: "max", label: "Max" },
];

export default function Composer({ onSend, onStop, isStreaming }: ComposerProps) {
    const [prompt, setPrompt] = useState("");
    const [thinking, setThinking] = useState("default");

    function handleSubmit() {
        const trimmed = prompt.trim();
        if (!trimmed || isStreaming) return;
        onSend(trimmed, thinking);
        setPrompt("");
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    return (
        <div className="composer-box">
            <textarea
                className="composer-input"
                placeholder="Ask anything..."
                value={prompt}
                onChange={(e) => setPrompt(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
            />

            <div className="composer-actions">
                <div className="composer-tools">
                    <button className="composer-icon-btn" title="Attach file">
                        <img src={attachFileIcon} alt="Attach file" />
                    </button>
                    <select
                        className="composer-thinking"
                        value={thinking}
                        onChange={(e) => setThinking(e.currentTarget.value)}
                        title="Thinking effort"
                    >
                        {THINKING_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

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
                        disabled={!prompt.trim()}
                        title="Send"
                    >
                        <img src={sendIcon} alt="Send" />
                    </button>
                )}
            </div>
        </div>
    );
}
