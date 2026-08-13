import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke, invokeStream, setToolApprovalHandler, type ApprovalRequest, type MessageBlock, type Session, type SessionSummary, type ToolStatus } from "../bridge";
import { getActiveApiConfigId, listApiConfigs, setActiveApiConfig, type ApiConfig } from "../apiConfigs";
import { getToolAutoExtend, setToolAutoExtend, getYoloMode, setYoloMode } from "../settings";
import { getActiveProjectId, listProjects, deleteProject, setActiveProject, type ApiProject } from "../projects";
import { estimateMessagesTokens } from "../tokenEstimate";
import "../styles/tokens.css";
import "./AppShell.css";
import Composer from "./Composer/Composer";
import ChatView, { type ChatMessage } from "./ChatView/ChatView";
import Sidebar from "./Sidebar/SideBar";
import SettingsModal from "./Settings/Settings";
import ProjectModal from "./Projects/ProjectModal";
import ApprovalModal from "./Approval/ApprovalModal";
import Toasts, { type Toast } from "./Toasts";
import ConfirmDialog from "./ConfirmDialog";
import arrowOpenIcon from "../assets/arrowOpen.svg";

export default function AppShell() {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(272);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [configs, setConfigs] = useState<ApiConfig[]>([]);
    const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [toolAutoExtend, setToolAutoExtendState] = useState<boolean>(getToolAutoExtend);
    const [yoloMode, setYoloModeState] = useState<boolean>(getYoloMode);
    const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
    const [projects, setProjects] = useState<ApiProject[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [projectToEdit, setProjectToEdit] = useState<ApiProject | null>(null);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmState, setConfirmState] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);

    const sessionIdRef = useRef<string>(crypto.randomUUID()); // Stable per chat SessionID, resets on "New Chat"
    const sessionCreatedAtRef = useRef<number>(0);
    const sessionTitleRef = useRef<string>("");
    const blocksRef = useRef<MessageBlock[]>([]);
    const toastIdRef = useRef(1);

    const shellStyle = {
        gridTemplateColumns: sidebarOpen ? "var(--sidebar-width) 1fr" : "1fr",
        "--sidebar-width": `${sidebarWidth}px`,
    } as CSSProperties;

    function toast(message: string, type: Toast["type"] = "info") {
        const id = toastIdRef.current++;
        setToasts((prev) => [...prev, { id, message, type }]);
    }

    function dismissToast(id: number) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }

    function askConfirm(title: string, message: string, onConfirm: () => void) {
        setConfirmState({ title, message, onConfirm });
    }

    const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;
    const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;

    const tokenUsage = useMemo(() => {
        const used = estimateMessagesTokens(messages);
        const max = activeConfig?.maxContextTokens ?? 64_000;
        return { used, max };
    }, [messages, activeConfig]);

    useEffect(() => {
        refreshSessions();
        refreshConfigs();
        refreshProjects();
    }, []);

    useEffect(() => {
        invoke("set_yolo_mode", { enabled: getYoloMode() }).catch(console.error);
    }, []);

    useEffect(() => {
        setToolApprovalHandler((req) => setPendingApproval(req));
        return () => setToolApprovalHandler(null);
    }, []);

    async function refreshProjects() {
        try {
            const [list, active] = await Promise.all([listProjects(), getActiveProjectId()]);
            setProjects(list);
            setActiveProjectId(active);
        } catch (err) {
            console.error("refresh projects failed", err);
        }
    }

    async function handleSelectProject(id: string) {
        try {
            const active = await setActiveProject(id);
            setActiveProjectId(active);
            setError(null);
            handleNewChat();
        } catch (err) {
            console.error("set_active_project failed", err);
        }
    }

    async function handleDeleteProject(id: string) {
        const project = projects.find((p) => p.id === id);
        askConfirm(
            "Delete project",
            `Delete "${project?.name ?? "this project"}"? Its chats will move to "No project".`,
            async () => {
                try {
                    await deleteProject(id);
                    await refreshProjects();
                    if (id === activeProjectId) {
                        handleNewChat();
                    }
                    toast("Project deleted", "success");
                } catch (err) {
                    toast(`Failed to delete project: ${String(err)}`, "error");
                }
            },
        );
    }

    function handleEditProject(project: ApiProject) {
        setProjectToEdit(project);
        setProjectsOpen(true);
    }

    function openNewProject() {
        setProjectToEdit(null);
        setProjectsOpen(true);
    }

    async function refreshConfigs() {
        try {
            const [list, active] = await Promise.all([listApiConfigs(), getActiveApiConfigId()]);
            setConfigs(list);
            let resolved = active;
            if (list.length > 0 && !resolved) {
                resolved = await setActiveApiConfig(list[0].id);
            }
            setActiveConfigId(resolved);
        } catch (err) {
            console.error("refresh configs failed", err);
        }
    }

    async function handleSelectConfig(id: string) {
        try {
            const active = await setActiveApiConfig(id);
            setActiveConfigId(active);
            setError(null);
        } catch (err) {
            console.error("set_active_api_config failed", err);
        }
    }

    function handleToolAutoExtendChange(value: boolean) {
        setToolAutoExtend(value);
        setToolAutoExtendState(value);
    }

    function handleYoloChange(value: boolean) {
        setYoloMode(value);
        setYoloModeState(value);
        invoke("set_yolo_mode", { enabled: value }).catch(console.error);
    }

    async function handleApproval(approved: boolean) {
        const req = pendingApproval;
        if (!req) return;
        setPendingApproval(null);
        try {
            await invoke("respond_tool_approval", { id: req.id, approved });
        } catch (err) {
            console.error("respond_tool_approval failed", err);
        }
    }

    async function refreshSessions() {
        try {
            setSessions(await invoke<SessionSummary[]>("list_sessions"));
        } catch (err) {
            console.error("list_sessions failed", err);
        }
    }

    async function persistSession(finalMessages: ChatMessage[]) {
        const now = Date.now();
        if (sessionCreatedAtRef.current === 0) {
            sessionCreatedAtRef.current = now;
        }

        await invoke("save_session", {
            session: {
                id: sessionIdRef.current,
                title: sessionTitleRef.current,
                projectId: activeProjectId,
                createdAt: sessionCreatedAtRef.current,
                updatedAt: now,
                messages: finalMessages.map((m) => ({
                    id: m.id,
                    role: m.role,
                    text: m.text,
                    blocks: m.blocks,
                })),
            },
        });
        setActiveSessionId((prev) => prev ?? sessionIdRef.current);
        await refreshSessions();
    }

    async function handleSelectSession(id: string) {
        try {
            const session = await invoke<Session>("load_session", { id });
            setMessages(
                session.messages.map((m) => ({
                    id: m.id || crypto.randomUUID(),
                    role:
                        m.role === "user"
                            ? ("user" as const)
                            : m.role === "system"
                              ? ("system" as const)
                              : ("assistant" as const),
                    text: m.text,
                    blocks: m.blocks ?? undefined,
                })),
            );
            sessionIdRef.current = id;
            sessionCreatedAtRef.current = session.createdAt;
            sessionTitleRef.current = session.title;
            setActiveSessionId(id);
            setError(null);

            if (session.projectId && session.projectId !== activeProjectId) {
                try {
                    const active = await setActiveProject(session.projectId);
                    setActiveProjectId(active);
                } catch (err) {
                    console.error("set_active_project failed", err);
                }
            }
        } catch (err) {
            console.error("load_session failed", err);
        }
    }

    async function handleDeleteSession(id: string) {
        askConfirm("Delete chat", "This chat will be permanently removed.", async () => {
            try {
                await invoke("delete_session", { id });
                await refreshSessions();
                if (activeSessionId === id) {
                    handleNewChat();
                }
                toast("Chat deleted", "success");
            } catch (err) {
                toast(`Failed to delete chat: ${String(err)}`, "error");
            }
        });
    }

    const [draftPrompt, setDraftPrompt] = useState("");

    function handleNewChat() {
        sessionIdRef.current = crypto.randomUUID();
        sessionCreatedAtRef.current = 0;
        sessionTitleRef.current = "";
        setActiveSessionId(null);
        setMessages([]);
        setError(null);
        setDraftPrompt("");
    }

    async function forkChat(prefix: ChatMessage[]) {
        sessionIdRef.current = crypto.randomUUID();
        sessionCreatedAtRef.current = Date.now();
        setActiveSessionId(null);
        setMessages(prefix);
        setError(null);
        await persistSession(prefix);
    }

    async function handleForkChat() {
        await forkChat(messages);
    }

    function handleDeleteMessage(id: string) {
        const msg = messages.find((m) => m.id === id);
        const label = msg?.role === "user" ? "user message" : "assistant message";
        askConfirm(
            "Delete message",
            `Are you sure you want to delete this ${label}?`,
            async () => {
                const next = messages.filter((m) => m.id !== id);
                if (next.length === messages.length) return;
                setMessages(next);
                try {
                    await persistSession(next);
                    toast("Message deleted", "success");
                } catch (err) {
                    console.error("persist after delete failed", err);
                    toast(`Failed to delete message: ${String(err)}`, "error");
                }
            },
        );
    }

    async function handleSend(prompt: string, thinking: string, configId: string) {
        const history = messages.map((m) => ({
            role: m.role,
            text: m.text,
            blocks: m.blocks,
        }));

        if (!sessionTitleRef.current) {
            sessionTitleRef.current = prompt;
        }

        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "user",
            text: prompt,
        };

        const next: ChatMessage[] = [...messages, userMessage];
        const assistantId = crypto.randomUUID();
        const assistantMessage: ChatMessage = {
            id: assistantId,
            role: "assistant",
            text: "",
        };

        setMessages([...next, assistantMessage]);
        blocksRef.current = [];
        setIsLoading(true);
        setError(null);

        try {
            let reply = "";
            const result = await invokeStream<"done" | "cancelled">("chat_stream", { history, prompt, thinking, configId, projectId: activeProjectId }, {
                onChunk: (chunk) => {
                    reply += String(chunk);
                    blocksRef.current = appendChunk(blocksRef.current, String(chunk));
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId ? { ...m, blocks: blocksRef.current } : m,
                        ),
                    );
                },
                onToolStatus: (status) => {
                    blocksRef.current = applyToolStatus(blocksRef.current, status);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId ? { ...m, blocks: blocksRef.current } : m,
                        ),
                    );
                },
                onReasoningDelta: (delta) => {
                    blocksRef.current = appendReasoning(blocksRef.current, String(delta));
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantId ? { ...m, blocks: blocksRef.current } : m,
                        ),
                    );
                },
            });
            const final: ChatMessage[] = [
                ...next,
                {
                    ...assistantMessage,
                    text: reply,
                    interrupted: result === "cancelled",
                    blocks: blocksRef.current,
                },
            ];
            setMessages(final);
            await persistSession(final);
        } catch (err) {
            setError(String(err));
            await persistSession(next);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleStop() {
        try {
            await invoke("cancel_stream");
        } catch (err) {
            console.error("cancel_stream failed", err);
        }
    }

    function appendChunk(blocks: MessageBlock[], chunk: string): MessageBlock[] {
        const last = blocks[blocks.length - 1];
        if (last?.type === "text") {
            return [...blocks.slice(0, -1), { type: "text", text: last.text + chunk }];
        }
        return [...blocks, { type: "text", text: chunk }];
    }

    function appendReasoning(blocks: MessageBlock[], delta: string): MessageBlock[] {
        const last = blocks[blocks.length - 1];
        if (last?.type === "thinking") {
            return [...blocks.slice(0, -1), { type: "thinking", text: last.text + delta }];
        }
        return [...blocks, { type: "thinking", text: delta }];
    }

    function applyToolStatus(blocks: MessageBlock[], status: ToolStatus): MessageBlock[] {
        if (status.state === "started") {
            return [...blocks, { type: "tool", run: { ...status, id: blocks.length } }];
        }

        for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];
            if (block.type === "tool" && block.run.name === status.name && block.run.state === "started") {
                return [
                    ...blocks.slice(0, i),
                    { type: "tool", run: { ...block.run, state: "done", output: status.output } },
                    ...blocks.slice(i + 1),
                ];
            }
        }
        return blocks;
    }

    return (
        <div className="app-shell" style={shellStyle}>
            {sidebarOpen && (
                <Sidebar
                    onToggle={() => setSidebarOpen(false)}
                    onResize={setSidebarWidth}
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelect={handleSelectSession}
                    onDelete={handleDeleteSession}
                    onNew={handleNewChat}
                    onOpenSettings={() => setSettingsOpen(true)}
                    projects={projects}
                    activeProjectId={activeProjectId}
                    onSelectProject={handleSelectProject}
                    onCreateProject={openNewProject}
                    onEditProject={handleEditProject}
                    onDeleteProject={handleDeleteProject}
                    isStreaming={isLoading}
                />
            )}

            <main className="main">
                {!sidebarOpen && (
                    <button
                        className="sidebar-reopen"
                        onClick={() => setSidebarOpen(true)}
                        title="Expand sidebar"
                    >
                        <img src={arrowOpenIcon} alt="Expand sidebar" />
                    </button>
                )}
                <ChatView
                    messages={messages}
                    isLoading={isLoading}
                    error={error}
                    toolAutoExtend={toolAutoExtend}
                    hasConfigs={configs.length > 0}
                    hasProjects={projects.length > 0}
                    onCreateProject={openNewProject}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onSelectPrompt={(text) => setDraftPrompt(text)}
                    onFork={handleForkChat}
                    onDeleteMessage={handleDeleteMessage}
                />
                <Composer
                    onSend={handleSend}
                    onStop={handleStop}
                    isStreaming={isLoading}
                    configs={configs}
                    activeConfigId={activeConfigId}
                    onSelectConfig={handleSelectConfig}
                    onOpenSettings={() => setSettingsOpen(true)}
                    projectName={activeProject?.name ?? null}
                    tokenUsage={tokenUsage}
                    draftPrompt={draftPrompt}
                    onDraftChange={setDraftPrompt}
                />
            </main>

            <SettingsModal
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                configs={configs}
                activeConfigId={activeConfigId}
                onChanged={refreshConfigs}
                toolAutoExtend={toolAutoExtend}
                onToolAutoExtendChange={handleToolAutoExtendChange}
                yoloMode={yoloMode}
                onYoloChange={handleYoloChange}
                askConfirm={askConfirm}
                onToast={toast}
            />

            {pendingApproval !== null && (
                <ApprovalModal
                    request={pendingApproval}
                    onApprove={() => handleApproval(true)}
                    onDeny={() => handleApproval(false)}
                />
            )}

            <ProjectModal
                open={projectsOpen}
                onClose={() => {
                    setProjectsOpen(false);
                    setProjectToEdit(null);
                }}
                projects={projects}
                activeProjectId={activeProjectId}
                onChanged={refreshProjects}
                editProject={projectToEdit}
                onEditDone={() => setProjectToEdit(null)}
                askConfirm={askConfirm}
                onToast={toast}
            />

            <Toasts toasts={toasts} onDismiss={dismissToast} />

            <ConfirmDialog
                open={confirmState !== null}
                title={confirmState?.title ?? ""}
                message={confirmState?.message ?? ""}
                onConfirm={() => {
                    confirmState?.onConfirm();
                    setConfirmState(null);
                }}
                onCancel={() => setConfirmState(null)}
            />
        </div>
    );
}
