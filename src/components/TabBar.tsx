import type { TabStatus } from "../hooks/useTabs";
import settingsIcon from "../assets/settings.svg";
import folderIcon from "../assets/folder.svg";
import "./TabBar.css";

interface TabBarProps {
    tabs: { id: string; title: string; isLoading: boolean; lastStatus: TabStatus }[];
    activeTabId: string | null;
    projectsOpen: boolean;
    onSelectProjects: () => void;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    onOpenSettings: () => void;
}

export default function TabBar({
    tabs,
    activeTabId,
    projectsOpen,
    onSelectProjects,
    onSelectTab,
    onCloseTab,
    onNewTab,
    onOpenSettings,
}: TabBarProps) {
    return (
        <div className="tab-bar">
            <button
                className={`tab tab-projects${projectsOpen ? " active" : ""}`}
                onClick={onSelectProjects}
                title="Projects"
            >
                <img className="tab-projects-icon" src={folderIcon} alt="" />
                <span>Projects</span>
            </button>

            <div className="tab-bar-scroll">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab${!projectsOpen && tab.id === activeTabId ? " active" : ""}`}
                        onClick={() => onSelectTab(tab.id)}
                        title={tab.title || "New chat"}
                    >
                        <span className="tab-status-wrap">
                            {tab.isLoading ? (
                                <span className="tab-status running" title="Running" />
                            ) : tab.lastStatus === "done" ? (
                                <span className="tab-status done" title="Done" />
                            ) : tab.lastStatus === "cancelled" ? (
                                <span className="tab-status cancelled" title="Cancelled" />
                            ) : tab.lastStatus === "error" ? (
                                <span className="tab-status error" title="Error" />
                            ) : null}
                        </span>
                        <span className="tab-title">{tab.title || "New chat"}</span>
                        <button
                            className="tab-close"
                            title="Close tab"
                            onClick={(e) => {
                                e.stopPropagation();
                                onCloseTab(tab.id);
                            }}
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            <button className="tab-add" onClick={onNewTab} title="New chat">
                +
            </button>

            <div className="tab-bar-spacer" />

            <button className="tab-settings" onClick={onOpenSettings} title="Settings">
                <img src={settingsIcon} alt="" />
            </button>
        </div>
    );
}
