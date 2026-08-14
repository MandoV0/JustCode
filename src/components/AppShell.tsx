import { useCallback, useEffect, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { invoke, setToolApprovalHandler, type ApprovalRequest, type SessionSummary } from "../bridge";
import { getActiveApiConfigId, listApiConfigs, setActiveApiConfig, type ApiConfig } from "../apiConfigs";
import { getToolAutoExtend, setToolAutoExtend, getYoloMode, setYoloMode } from "../settings";
import {
    deleteProject,
    listProjects,
    saveProject,
    setActiveProject,
    type ApiProject,
} from "../projects";
import { estimateMessagesTokens } from "../tokenEstimate";
import { toSessionMessage, type ChatMessage } from "../messages";
import { useTabs } from "../hooks/useTabs";
import { useToasts } from "../hooks/useToasts";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import "../styles/tokens.css";
import "./AppShell.css";
import TabBar from "./TabBar";
import Sidebar from "./Sidebar";
import Composer from "./Composer/Composer";
import ChatView from "./ChatView/ChatView";
import SettingsModal from "./Settings/Settings";
import ApprovalModal from "./Approval/ApprovalModal";
import Toasts from "./Toasts";

export default function AppShell() {
    const { toasts, toast, dismissToast } = useToasts();
    const { confirmAction, dialog: confirmDialog } = useConfirmDialog();

    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [configs, setConfigs] = useState<ApiConfig[]>([]);
    const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [toolAutoExtend, setToolAutoExtendState] = useState<boolean>(getToolAutoExtend);
    const [yoloMode, setYoloModeState] = useState<boolean>(getYoloMode);
    const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
    const [projects, setProjects] = useState<ApiProject[]>([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const refreshSessions = useCallback(async () => {
        try {
            setSessions(await invoke<SessionSummary[]>("list_sessions"));
        } catch (err) {
            console.error("list_sessions failed", err);
        }
    }, []);

    const persistSession = useCallback(
        async (
            sessionId: string,
            title: string,
            projectId: string | null,
            createdAt: number,
            finalMessages: ChatMessage[],
        ) => {
            const now = Date.now();
            const effectiveCreatedAt = createdAt === 0 ? now : createdAt;
            try {
                await invoke("save_session", {
                    session: {
                        id: sessionId,
                        title,
                        projectId,
                        createdAt: effectiveCreatedAt,
                        updatedAt: now,
                        messages: finalMessages.map(toSessionMessage),
                    },
                });
            } catch (err) {
                console.error("save_session failed", err);
            }
            await refreshSessions();
        },
        [refreshSessions],
    );

    const {
        tabs,
        activeTabId,
        projectsOpen,
        setActiveTabId,
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
    } = useTabs({ persistSession, refreshSessions, toast, confirmAction });

    const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
    const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
    const maxContextTokens = activeConfig?.maxContextTokens ?? 64_000;

    useEffect(() => {
        refreshSessions();
        refreshConfigs();
        refreshProjects();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        invoke("set_yolo_mode", { enabled: getYoloMode() }).catch(console.error);
    }, []);

    useEffect(() => {
        setToolApprovalHandler((req) => {
            setPendingApproval((prev) => (req.expired ? (prev?.id === req.id ? null : prev) : req));
        });
        return () => setToolApprovalHandler(null);
    }, []);

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            const mod = e.metaKey || e.ctrlKey;
            if (!mod) return;
            const key = e.key.toLowerCase();
            if (key === "n") {
                e.preventDefault();
                handleNewTab();
            } else if (key === "k") {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent("justcode:focus-composer"));
            } else if (key === "b") {
                e.preventDefault();
                setSidebarOpen((v) => !v);
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [handleNewTab]);

    async function refreshProjects() {
        try {
            const list = await listProjects();
            setProjects(list);
            ensureInitialTab(list[0]?.id ?? null);
        } catch (err) {
            console.error("refresh projects failed", err);
        }
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

    async function handleSaveProject(project: ApiProject) {
        await saveProject(project);
        await refreshProjects();
    }

    function handleDeleteProject(id: string) {
        confirmAction(
            "Delete project",
            "Delete this project? Its chats will stay under \"No project\".",
            async () => {
                try {
                    await deleteProject(id);
                    await refreshProjects();
                    updateAllTabs((prev) =>
                        prev.map((t) => (t.projectId === id ? { ...t, projectId: null } : t)),
                    );
                    toast("Project deleted", "success");
                } catch (err) {
                    toast(`Failed to delete project: ${String(err)}`, "error");
                }
            },
            true,
        );
    }

    async function handleSelectProject(id: string | null) {
        try {
            if (id) await setActiveProject(id);
            if (activeTabId) {
                updateTab(activeTabId, (t) => ({ ...t, projectId: id }));
            }
        } catch (err) {
            console.error("set_active_project failed", err);
        }
    }

    async function handleSelectConfig(id: string) {
        try {
            const active = await setActiveApiConfig(id);
            setActiveConfigId(active);
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

    const approvalSourceTitle = pendingApproval?.agentId
        ? tabs.find((t) => t.id === pendingApproval.agentId)?.title
        : undefined;

    const showPanel = !projectsOpen && activeTab !== null;

    return (
        <div className="app-shell">
            <TabBar
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((v) => !v)}
                onNewTab={() => handleNewTab()}
                onOpenSettings={() => setSettingsOpen(true)}
            />

            <div className="app-body">
                {sidebarOpen && (
                    <Sidebar
                        projects={projects}
                        sessions={sessions}
                        activeProjectId={activeTab?.projectId ?? null}
                        activeChatId={activeTabId}
                        openChats={tabs.map((t) => ({
                            id: t.id,
                            sessionId: t.sessionId,
                            title: t.title,
                            projectId: t.projectId,
                            isLoading: t.isLoading,
                            lastStatus: t.lastStatus,
                        }))}
                        onSelectChat={(id) => {
                            setActiveTabId(id);
                        }}
                        onCloseChat={handleCloseTab}
                        onOpenSession={handleOpenSession}
                        onDeleteSession={handleDeleteSession}
                        onRenameSession={handleRenameSession}
                        onNewChat={handleNewTab}
                        onSaveProject={handleSaveProject}
                        onDeleteProject={handleDeleteProject}
                        onSelectProject={handleSelectProject}
                        onToast={toast}
                    />
                )}

                <div className="workspace">
                    {!showPanel ? (
                        <div className="workspace-hero">
                            <div className="workspace-hero-icon">
                                <Sparkles size={40} strokeWidth={1.2} />
                            </div>
                            <h1 className="workspace-hero-title">What should we get done?</h1>
                            <p className="workspace-hero-sub">Pick a project, then start working.</p>
                            <button className="workspace-hero-btn" onClick={() => handleNewTab()}>
                                <Plus size={16} />
                                <span>New chat</span>
                            </button>
                        </div>
                    ) : (
                        <div className="workspace-panel">
                            <div className="workspace-header">
                                <div className="workspace-breadcrumb">
                                    <span className="workspace-breadcrumb-project">
                                        {activeTab.projectId
                                            ? (projects.find((p) => p.id === activeTab.projectId)?.name ?? "Project")
                                            : "No project"}
                                    </span>
                                    <span className="workspace-breadcrumb-sep">/</span>
                                    <span className="workspace-breadcrumb-title">{activeTab.title || "New chat"}</span>
                                </div>
                            </div>

                            <div className="workspace-body">
                                <ChatView
                                    messages={activeTab.messages}
                                    isLoading={activeTab.isLoading}
                                    error={activeTab.error}
                                    toolAutoExtend={toolAutoExtend}
                                    hasConfigs={configs.length > 0}
                                    hasProjects={projects.length > 0}
                                    onCreateProject={() => setSidebarOpen(true)}
                                    onOpenSettings={() => setSettingsOpen(true)}
                                    onSelectPrompt={(text) =>
                                        updateTab(activeTab.id, (t) => ({ ...t, draftPrompt: text }))
                                    }
                                    onFork={() => handleForkChat(activeTab.id)}
                                    onDeleteMessage={(msgId) => handleDeleteMessage(activeTab.id, msgId)}
                                />
                                <Composer
                                    isActive={true}
                                    onSend={(prompt, thinking, configId) =>
                                        handleSend(activeTab.id, prompt, thinking, configId)
                                    }
                                    onStop={() => handleStop(activeTab.id)}
                                    isStreaming={activeTab.isLoading}
                                    configs={configs}
                                    activeConfigId={activeConfigId}
                                    onSelectConfig={handleSelectConfig}
                                    onOpenSettings={() => setSettingsOpen(true)}
                                    projectName={
                                        activeTab.projectId
                                            ? (projects.find((p) => p.id === activeTab.projectId)?.name ?? null)
                                            : null
                                    }
                                    projects={projects}
                                    activeProjectId={activeTab.projectId}
                                    onSelectProject={handleSelectProject}
                                    approvalEnabled={!yoloMode}
                                    onApprovalChange={(v) => handleYoloChange(!v)}
                                    tokenUsage={{
                                        used: estimateMessagesTokens(activeTab.messages),
                                        max: maxContextTokens,
                                    }}
                                    draftPrompt={activeTab.draftPrompt}
                                    onDraftChange={(val) => updateTab(activeTab.id, (t) => ({ ...t, draftPrompt: val }))}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

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
                askConfirm={confirmAction}
                onToast={toast}
            />

            {pendingApproval !== null && (
                <ApprovalModal
                    request={pendingApproval}
                    onApprove={() => handleApproval(true)}
                    onDeny={() => handleApproval(false)}
                    sourceName={approvalSourceTitle}
                />
            )}

            <Toasts toasts={toasts} onDismiss={dismissToast} />

            {confirmDialog}
        </div>
    );
}
