import type { MessageBlock, SessionMessage } from "./bridge";

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    text: string;
    interrupted?: boolean;
    blocks?: MessageBlock[];
}

export function toChatMessage(message: SessionMessage): ChatMessage {
    return {
        id: message.id || crypto.randomUUID(),
        role:
            message.role === "user"
                ? ("user" as const)
                : message.role === "system"
                  ? ("system" as const)
                  : ("assistant" as const),
        text: message.text,
        blocks: message.blocks ?? undefined,
        interrupted: message.interrupted ?? false,
    };
}

export function toSessionMessage(message: ChatMessage): SessionMessage {
    return {
        id: message.id,
        role: message.role,
        text: message.text,
        blocks: message.blocks,
        interrupted: message.interrupted ?? false,
    };
}
