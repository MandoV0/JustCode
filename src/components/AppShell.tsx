import { useCallback, useEffect, useState } from "react";
import { invoke, setToolApprovalHandler, type ApprovalRequest, type SessionSummary } from "../bridge";
import { getActiveApiConfigId, listApiConfigs, setActiveApiConfig, type ApiConfig } from "../apiConfigs";
import { getToolAutoExtend, setToolAutoExtend, getYoloMode, setYoloMode } from "../settings";
import { deleteProject, listProjects, saveProject, type ApiProject } from "../projects";
import { estimateMessagesTokens } from "../tokenEstimate";
import { toSessionMessage, type ChatMessage } from "../messages";
import { useTabs } from "../hooks/useTabs";
import { useToasts } from "../hooks/useToasts";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import "../styles/tokens.css";
import "./AppShell.css";
import Composer from "./Composer/Composer";
import ChatView from "./ChatView/ChatView";
import TabBar from "./TabBar";
import ProjectsPanel from "./ProjectsPanel";
import ErrorBoundary from "./ErrorBoundary";
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
    } = useTabs({ persistSession, refreshSessions, toast, confirmAction });

    const activeConfig = configs.find((c) => c.id === activeConfigId) ?? null;
    const maxContextTokens = activeConfig?.maxContextTokens ?? 64_000;

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
        );
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

    return (
        <div className="app-shell">
            <TabBar
                tabs={tabs.map((t) => ({ id: t.id, title: t.title, isLoading: t.isLoading, lastStatus: t.lastStatus }))}
                activeTabId={projectsOpen ? null : activeTabId}
                projectsOpen={projectsOpen}
                onSelectProjects={() => setProjectsOpen(true)}
                onSelectTab={(id) => {
                    setActiveTabId(id);
                    setProjectsOpen(false);
                }}
                onCloseTab={handleCloseTab}
                onNewTab={() => handleNewTab()}
                onOpenSettings={() => setSettingsOpen(true)}
            />

            <div className="tab-panels">
                {projectsOpen && (
                    <div className="tab-panel active">
                        <ErrorBoundary>
                            <ProjectsPanel
                                projects={projects}
                                sessions={sessions}
                                onOpenSession={handleOpenSession}
                                onDeleteSession={handleDeleteSession}
                                onRenameSession={handleRenameSession}
                                onNewChat={handleNewTab}
                                onSaveProject={handleSaveProject}
                                onDeleteProject={handleDeleteProject}
                                onToast={toast}
                            />
                        </ErrorBoundary>
                    </div>
                )}

                {tabs.map((tab) => {
                    const isActive = !projectsOpen && tab.id === activeTabId;
                    const projectName = projects.find((p) => p.id === tab.projectId)?.name ?? null;
                    const tokenUsage = {
                        used: estimateMessagesTokens(tab.messages),
                        max: maxContextTokens,
                    };

                    return (
                        <div key={tab.id} className={`tab-panel${isActive ? " active" : ""}`}>
                            <ErrorBoundary>
                                <ChatView
                                    messages={tab.messages}
                                    isLoading={tab.isLoading}
                                    error={tab.error}
                                    toolAutoExtend={toolAutoExtend}
                                    hasConfigs={configs.length > 0}
                                    hasProjects={projects.length > 0}
                                    onCreateProject={() => setProjectsOpen(true)}
                                    onOpenSettings={() => setSettingsOpen(true)}
                                    onSelectPrompt={(text) => updateTab(tab.id, (t) => ({ ...t, draftPrompt: text }))}
                                    onFork={() => handleForkChat(tab.id)}
                                    onDeleteMessage={(msgId) => handleDeleteMessage(tab.id, msgId)}
                                />
                                <Composer
                                    onSend={(prompt, thinking, configId) => handleSend(tab.id, prompt, thinking, configId)}
                                    onStop={() => handleStop(tab.id)}
                                    isStreaming={tab.isLoading}
                                    configs={configs}
                                    activeConfigId={activeConfigId}
                                    onSelectConfig={handleSelectConfig}
                                    onOpenSettings={() => setSettingsOpen(true)}
                                    projectName={projectName}
                                    tokenUsage={tokenUsage}
                                    draftPrompt={tab.draftPrompt}
                                    onDraftChange={(val) => updateTab(tab.id, (t) => ({ ...t, draftPrompt: val }))}
                                />
                            </ErrorBoundary>
                        </div>
                    );
                })}
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
