import { useEffect } from "react";
import { type ApprovalRequest } from "../../bridge";

interface ApprovalModalProps {
    request: ApprovalRequest;
    onApprove: () => void;
    onDeny: () => void;
}

export default function ApprovalModal({ request, onApprove, onDeny }: ApprovalModalProps) {
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onDeny();
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [onDeny]);

    let argsText = request.arguments;
    try {
        argsText = JSON.stringify(JSON.parse(request.arguments), null, 2);
    } catch {
        // Not JSON, keep raw text
    }

    return (
        <div className="approval-backdrop" onClick={onDeny}>
            <div className="approval-modal" onClick={(e) => e.stopPropagation()}>
                <h2 className="approval-title">Approve tool call</h2>
                <div className="approval-tool">{request.name}</div>
                <pre className="approval-args">{argsText}</pre>
                <p className="approval-hint">Waiting for your approval — YOLO mode off.</p>
                <div className="approval-actions">
                    <button className="approval-deny" onClick={onDeny}>
                        Deny
                    </button>
                    <button className="approval-approve" onClick={onApprove}>
                        Approve
                    </button>
                </div>
            </div>
        </div>
    );
}
