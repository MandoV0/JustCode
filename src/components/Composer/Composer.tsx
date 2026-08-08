import { useState, type KeyboardEvent } from "react";
import "./Composer.css";
import sendIcon from "../../assets/send.svg";
import attachFileIcon from "../../assets/attach_file.svg";

interface ComposerProps {
    onSend: (prompt: string) => void;
    disabled?: boolean;
}

export default function Composer({ onSend, disabled }: ComposerProps) {
    const [prompt, setPrompt] = useState("");

    function handleSubmit() {
        const trimmed = prompt.trim();
        if (!trimmed || disabled) return;
        onSend(trimmed);
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
                <button className="composer-icon-btn" title="Attach file">
                    <img src={attachFileIcon} alt="Attach file" />
                </button>

                <div className="composer-spacer" />

                <button
                    className="composer-send-btn"
                    onClick={handleSubmit}
                    disabled={!prompt.trim() || disabled}
                    title="Send"
                >
                    <img src={sendIcon} alt="Send" />
                </button>
            </div>
        </div>
    );
}
