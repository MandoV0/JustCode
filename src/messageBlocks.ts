import type { MessageBlock, ToolStatus } from "./bridge";

export function appendChunk(blocks: MessageBlock[], chunk: string): MessageBlock[] {
    const last = blocks[blocks.length - 1];
    if (last?.type === "text") {
        return [...blocks.slice(0, -1), { type: "text", text: last.text + chunk }];
    }
    return [...blocks, { type: "text", text: chunk }];
}

export function appendReasoning(blocks: MessageBlock[], delta: string): MessageBlock[] {
    const last = blocks[blocks.length - 1];
    if (last?.type === "thinking") {
        return [...blocks.slice(0, -1), { type: "thinking", text: last.text + delta }];
    }
    return [...blocks, { type: "thinking", text: delta }];
}

export function applyToolStatus(blocks: MessageBlock[], status: ToolStatus): MessageBlock[] {
    if (status.state === "started") {
        return [...blocks, { type: "tool", run: { ...status, id: status.callId ?? `call-${blocks.length}` } }];
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block.type !== "tool") continue;
        const matches = status.callId
            ? block.run.id === status.callId
            : block.run.name === status.name && block.run.state === "started";
        if (!matches) continue;
        return [
            ...blocks.slice(0, i),
            { type: "tool", run: { ...block.run, ...status } },
            ...blocks.slice(i + 1),
        ];
    }
    return blocks;
}
