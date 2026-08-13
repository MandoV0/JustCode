import { type MessageBlock } from "./bridge";

const HEADROOM = 1.15;
const PER_MESSAGE_OVERHEAD = 4;

// Mirrors JustCode.Desktop/Infrastructure/TokenEstimator.cs (chars/4 * 1.15).
// Approximate, only used to surface a rough context usage to the user.
export function estimateTokens(charCount: number): number {
    return Math.ceil((charCount / 4) * HEADROOM);
}

export function estimateMessageTokens(message: {
    text?: string;
    blocks?: MessageBlock[];
}): number {
    let chars = 0;
    if (message.blocks && message.blocks.length > 0) {
        for (const block of message.blocks) {
            if (block.type === "text" || block.type === "thinking") {
                chars += block.text?.length ?? 0;
            } else if (block.type === "tool") {
                chars += (block.run?.arguments ?? "").length;
                chars += (block.run?.output ?? "").length;
            }
        }
    } else {
        chars = message.text?.length ?? 0;
    }
    return estimateTokens(chars) + PER_MESSAGE_OVERHEAD;
}

export function estimateMessagesTokens(
    messages: { text?: string; blocks?: MessageBlock[] }[],
): number {
    return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
}

export function formatTokens(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return String(tokens);
}
