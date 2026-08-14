import { PanelLeft, Plus, Settings } from "lucide-react";
import "./TabBar.css";

interface TabBarProps {
    sidebarOpen: boolean;
    onToggleSidebar: () => void;
    onNewTab: () => void;
    onOpenSettings: () => void;
}

export default function TabBar({ sidebarOpen, onToggleSidebar, onNewTab, onOpenSettings }: TabBarProps) {
    return (
        <div className="window-bar">
            <div className="window-brand">JustCode</div>

            <div className="window-bar-spacer" />

            <button className="window-bar-btn" onClick={onNewTab} title="New chat">
                <Plus size={17} />
            </button>

            <button
                className={`window-bar-btn${sidebarOpen ? " active" : ""}`}
                onClick={onToggleSidebar}
                title="Toggle sidebar"
            >
                <PanelLeft size={17} />
            </button>
            <button className="window-bar-btn" onClick={onOpenSettings} title="Settings">
                <Settings size={17} />
            </button>
        </div>
    );
}
