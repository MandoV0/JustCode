type Pending = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: number;
    onChunk?: (data: unknown) => void;
    onToolStatus?: (status: ToolStatus) => void;
};

type BridgeMessage = {
    kind: "response" | "chunk" | "tool_status";
    id: number;
    ok?: boolean;
    data?: unknown;
    error?: string;
};

export type ToolStatus = {
    name: string;
    arguments?: string;
    state: "started" | "done";
    output?: string;
};

export interface InvokeOptions {
    timeoutMs?: number;
    onChunk?: (data: unknown) => void;
    onToolStatus?: (status: ToolStatus) => void;
}

export interface SessionMessage {
    id: string;
    role: string;
    text: string;
}

export interface SessionSummary {
    id: string;
    title: string;
    updatedAt: number;
    messageCount: number;
}

export interface Session {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: SessionMessage[];
}

let nextId = 1;
const pending = new Map<number, Pending>();
const DEFAULT_REQUEST_TIMEOUT_MS = 60000*50;

const waitForNativeBridge = new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
        if (typeof (window as unknown as Record<string, unknown>).invokeCSharpAction === "function") {
            window.clearInterval(timer);
            resolve();
        } else if (Date.now() - started > 5000*50) {
            window.clearInterval(timer);
            reject(new Error("Native bridge unavailable: invokeCSharpAction was not found within 5000ms"));
        }
    }, 25);
});

function postToNative(message: object) {
    const bridge = (window as unknown as Record<string, unknown>).invokeCSharpAction as
        | ((data: string) => void)
        | undefined;
    if (typeof bridge !== "function") {
        throw new Error("invokeCSharpAction is not available");
    }
    bridge(JSON.stringify(message));
}

export async function invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>,
    options?: InvokeOptions,
): Promise<T> {
    await waitForNativeBridge;
    const id = nextId++;
    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, onChunk, onToolStatus } = options ?? {};

    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`Native bridge request timed out for command '${cmd}' (id: ${id})`));
            }
        }, timeoutMs);

        pending.set(id, {
            resolve: (value) => {
                window.clearTimeout(timer);
                resolve(value as T);
            },
            reject: (reason) => {
                window.clearTimeout(timer);
                reject(reason);
            },
            timer,
            onChunk,
            onToolStatus,
        });

        try {
            postToNative({ id, cmd, args });
        } catch (err) {
            window.clearTimeout(timer);
            pending.delete(id);
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

export async function invokeStream<T = unknown>(
    cmd: string,
    args: Record<string, unknown> | undefined,
    options?: InvokeOptions,
): Promise<T> {
    return invoke<T>(cmd, args, options);
}

(window as unknown as Record<string, unknown>).justcodePostMessage = (
    message: BridgeMessage | string,
) => {
    const parsed = typeof message === "string" ? (JSON.parse(message) as BridgeMessage) : message;
    if (parsed?.kind === "chunk") {
        pending.get(parsed.id)?.onChunk?.(parsed.data);
        return;
    }
    if (parsed?.kind === "tool_status") {
        pending.get(parsed.id)?.onToolStatus?.(parsed.data as ToolStatus);
        return;
    }
    if (parsed?.kind !== "response") {
        return;
    }
    const entry = pending.get(parsed.id);
    if (!entry) {
        return;
    }
    pending.delete(parsed.id);
    if (parsed.ok) {
        entry.resolve(parsed.data);
    } else {
        entry.reject(new Error(parsed.error ?? "Unknown native error"));
    }
};
