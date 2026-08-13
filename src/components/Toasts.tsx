import { useEffect, useRef } from "react";
import "./Toasts.css";

export interface Toast {
    id: number;
    message: string;
    type: "info" | "success" | "error";
}

interface ToastsProps {
    toasts: Toast[];
    onDismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 4000;

export default function Toasts({ toasts, onDismiss }: ToastsProps) {
    const timersRef = useRef(new Map<number, number>());

    useEffect(() => {
        const timers = timersRef.current;
        for (const toast of toasts) {
            if (timers.has(toast.id)) continue;
            timers.set(
                toast.id,
                window.setTimeout(() => {
                    timers.delete(toast.id);
                    onDismiss(toast.id);
                }, AUTO_DISMISS_MS),
            );
        }
        return () => {
            for (const timer of timers.values()) window.clearTimeout(timer);
            timers.clear();
        };
    }, [toasts, onDismiss]);

    return (
        <div className="toasts">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={`toast toast-${toast.type}`}
                    onClick={() => onDismiss(toast.id)}
                    role="status"
                >
                    {toast.message}
                </div>
            ))}
        </div>
    );
}
