import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
    children: ReactNode;
    onReload?: () => void;
    reloadLabel?: string;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    handleReload = () => {
        this.setState({ error: null });
        this.props.onReload?.();
    };

    render() {
        if (this.state.error) {
            return (
                <div className="error-boundary">
                    <h2 className="error-boundary-title">Something went wrong</h2>
                    <p className="error-boundary-hint">
                        The view crashed while rendering. You can reset it — your chats are saved.
                    </p>
                    <pre className="error-boundary-detail">{String(this.state.error.message || this.state.error)}</pre>
                    <button className="error-boundary-btn" onClick={this.handleReload}>
                        {this.props.reloadLabel ?? "Reset"}
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
