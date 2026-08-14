import { useRef, useState } from "react";
import { invoke, type MessageBlock, type Session, type SessionSummary } from "../bridge";
import { appendChunk, appendReasoning, applyToolStatus } from "../messageBlocks";
import { toChatMessage, toSessionMessage, type ChatMessage } from "../messages";
import type { Toast } from "../components/Toasts";

export type TabStatus = "idle" | "running" | "done" | "cancelled" | "error";

export interface ChatTab {
    id: string;
    sessionId: string;
    title: string;
    projectId: string | null;
    createdAt: number;
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
    draftPrompt: string;
    lastStatus: TabStatus;
}

function createTab(overrides: Partial<ChatTab> = {}): ChatTab {
    return {
        id: crypto.randomUUID(),
        sessionId: crypto.randomUUID(),
        title: "",
        projectId: null,
        createdAt: 0,
        messages: [],
        isLoading: false,
        error: null,
        draftPrompt: "",
        lastStatus: "idle",
        ...overrides,
    };
}

export interface UseTabsOptions {
    persistSession: (
        sessionId: string,
        title: string,
        projectId: string | null,
        createdAt: number,
        messages: ChatMessage[],
    ) => Promise<void>;
    refreshSessions: () => Promise<void>;
    toast: (message: string, type?: Toast["type"]) => void;
    confirmAction: (
        title: string,
        message: string,
        action: () => void | Promise<void>,
        danger?: boolean,
    ) => void;
}

export function useTabs({ persistSession, refreshSessions, toast, confirmAction }: UseTabsOptions) {
    const [tabs, setTabs] = useState<ChatTab[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const lastProjectIdRef = useRef<string | null>(null);

    function updateTab(id: string, fn: (tab: ChatTab) => ChatTab) {
        setTabs((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
    }

    function updateAllTabs(fn: (tabs: ChatTab[]) => ChatTab[]) {
        setTabs(fn);
    }

    function ensureInitialTab(projectId: string | null) {
        if (lastProjectIdRef.current === null) {
            lastProjectIdRef.current = projectId;
        }
        setTabs((prev) => {
            if (prev.length > 0) return prev;
            const tab = createTab({ projectId: lastProjectIdRef.current });
            setActiveTabId(tab.id);
            return [tab];
        });
    }

    function handleNewTab(explicitProjectId?: string | null) {
        const projectId = explicitProjectId ?? lastProjectIdRef.current ?? null;
        if (projectId) lastProjectIdRef.current = projectId;
        const tab = createTab({ projectId });
        setTabs((prev) => [...prev, tab]);
        setActiveTabId(tab.id);
        setProjectsOpen(false);
    }

    async function handleOpenSession(session: SessionSummary) {
        const existing = tabs.find((t) => t.sessionId === session.id);
        if (existing) {
            setActiveTabId(existing.id);
            setProjectsOpen(false);
            return;
        }

        try {
            const loaded = await invoke<Session>("load_session", { id: session.id });
            const tab = createTab({
                sessionId: session.id,
                title: loaded.title,
                createdAt: loaded.createdAt,
                projectId: loaded.projectId ?? lastProjectIdRef.current ?? null,
                messages: loaded.messages.map(toChatMessage),
            });
            if (tab.projectId) lastProjectIdRef.current = tab.projectId;
            setTabs((prev) => [...prev, tab]);
            setActiveTabId(tab.id);
            setProjectsOpen(false);
        } catch (err) {
            console.error("load_session failed", err);
            toast(`Failed to open chat: ${String(err)}`, "error");
        }
    }

    function handleCloseTab(id: string) {
        const tab = tabs.find((t) => t.id === id);
        if (!tab) return;
        if (tab.isLoading) {
            invoke("cancel_stream", { agentId: id }).catch(console.error);
        }

        const remaining = tabs.filter((t) => t.id !== id);
        setTabs(remaining);
        if (projectsOpen) return;

        if (activeTabId === id) {
            if (remaining.length === 0) {
                setActiveTabId(null);
                setProjectsOpen(true);
            } else {
                const index = tabs.findIndex((t) => t.id === id);
                setActiveTabId(remaining[Math.max(0, index - 1)].id);
            }
        }
    }

    async function handleRenameSession(id: string, title: string) {
        const trimmed = title.trim();
        if (!trimmed) return;
        try {
            await invoke("rename_session", { id, title: trimmed });
            await refreshSessions();
            setTabs((prev) => prev.map((t) => (t.sessionId === id ? { ...t, title: trimmed } : t)));
        } catch (err) {
            toast(`Failed to rename chat: ${String(err)}`, "error");
        }
    }

    function handleDeleteSession(id: string) {
        confirmAction("Delete chat", "This chat will be permanently removed.", async () => {
            try {
                await invoke("delete_session", { id });
                await refreshSessions();
                setTabs((prev) => prev.filter((t) => t.sessionId !== id));
                toast("Chat deleted", "success");
            } catch (err) {
                toast(`Failed to delete chat: ${String(err)}`, "error");
            }
        }, true);
    }

    async function handleForkChat(tabId: string) {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) return;
        const newTab = createTab({
            projectId: tab.projectId,
            messages: [...tab.messages],
            createdAt: Date.now(),
        });
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        setProjectsOpen(false);
        await persistSession(newTab.sessionId, newTab.title, newTab.projectId, newTab.createdAt, newTab.messages);
    }

    function handleDeleteMessage(tabId: string, msgId: string) {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) return;
        const msg = tab.messages.find((m) => m.id === msgId);
        const label = msg?.role === "user" ? "user message" : "assistant message";
        confirmAction("Delete message", `Are you sure you want to delete this ${label}?`, async () => {
            const next = tab.messages.filter((m) => m.id !== msgId);
            if (next.length === tab.messages.length) return;
            updateTab(tabId, (t) => ({ ...t, messages: next }));
            await persistSession(tab.sessionId, tab.title, tab.projectId, tab.createdAt, next);
            toast("Message deleted", "success");
        }, true);
    }

    function handleStop(tabId: string) {
        invoke("cancel_stream", { agentId: tabId }).catch(console.error);
    }

    function setAssistantBlocks(tabId: string, assistantId: string, blocks: MessageBlock[]) {
        updateTab(tabId, (t) => ({
            ...t,
            messages: t.messages.map((m) => (m.id === assistantId ? { ...m, blocks } : m)),
        }));
    }

    async function handleSend(tabId: string, prompt: string, thinking: string, configId: string) {
        const tab = tabs.find((t) => t.id === tabId);
        if (!tab) return;

        const history = tab.messages.map(toSessionMessage);
        const title = tab.title || prompt;

        const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: prompt };
        const next: ChatMessage[] = [...tab.messages, userMessage];
        const assistantId = crypto.randomUUID();
        const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", text: "" };
        const blocksRef = { current: [] as MessageBlock[] };

        updateTab(tabId, (t) => ({
            ...t,
            title,
            messages: [...next, assistantMessage],
            isLoading: true,
            error: null,
            lastStatus: "running",
        }));

        try {
            let reply = "";
            const result = await invoke<"done" | "cancelled">(
                "chat_stream",
                { agentId: tabId, history, prompt, thinking, configId, projectId: tab.projectId },
                {
                    onChunk: (chunk) => {
                        reply += String(chunk);
                        blocksRef.current = appendChunk(blocksRef.current, String(chunk));
                        setAssistantBlocks(tabId, assistantId, blocksRef.current);
                    },
                    onToolStatus: (status) => {
                        blocksRef.current = applyToolStatus(blocksRef.current, status);
                        setAssistantBlocks(tabId, assistantId, blocksRef.current);
                    },
                    onReasoningDelta: (delta) => {
                        blocksRef.current = appendReasoning(blocksRef.current, String(delta));
                        setAssistantBlocks(tabId, assistantId, blocksRef.current);
                    },
                },
            );

            const final: ChatMessage[] = [
                ...next,
                {
                    ...assistantMessage,
                    text: reply,
                    interrupted: result === "cancelled",
                    blocks: blocksRef.current,
                },
            ];
            updateTab(tabId, (t) => ({
                ...t,
                messages: final,
                lastStatus: result === "cancelled" ? "cancelled" : "done",
            }));
            await persistSession(tab.sessionId, title, tab.projectId, tab.createdAt, final);
        } catch (err) {
            updateTab(tabId, (t) => ({ ...t, error: String(err), lastStatus: "error" }));
            await persistSession(tab.sessionId, title, tab.projectId, tab.createdAt, next);
        } finally {
            updateTab(tabId, (t) => ({ ...t, isLoading: false }));
        }
    }

    return {
        tabs,
        activeTabId,
        projectsOpen,
        setActiveTabId,
        setProjectsOpen,
        updateTab,
        updateAllTabs,
        ensureInitialTab,
        handleNewTab,
        handleOpenSession,
        handleCloseTab,
        handleRenameSession,
        handleDeleteSession,
        handleForkChat,
        handleDeleteMessage,
        handleSend,
        handleStop,
    };
}
