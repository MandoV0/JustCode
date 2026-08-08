type Pending = {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
};

type BridgeMessage = {
    kind: "response";
    id: number;
    ok: boolean;
    data?: unknown;
    error?: string;
};

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

const waitForNativeBridge = new Promise<void>((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
        if (typeof (window as unknown as Record<string, unknown>).invokeCSharpAction === "function") {
            window.clearInterval(timer);
            resolve();
        } else if (Date.now() - started > 5000) {
            window.clearInterval(timer);
            resolve();
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
): Promise<T> {
    await waitForNativeBridge;
    const id = nextId++;

    return new Promise<T>((resolve, reject) => {
        pending.set(id, {
            resolve: (value) => resolve(value as T),
            reject,
        });
        postToNative({ id, cmd, args });
    });
}

(window as unknown as Record<string, unknown>).justcodePostMessage = (
    message: BridgeMessage | string,
) => {
    const parsed = typeof message === "string" ? (JSON.parse(message) as BridgeMessage) : message;
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
