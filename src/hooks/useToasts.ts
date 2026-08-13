import { useCallback, useRef, useState } from "react";
import type { Toast } from "../components/Toasts";

export function useToasts() {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(1);

    const toast = useCallback((message: string, type: Toast["type"] = "info") => {
        const id = toastIdRef.current++;
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return { toasts, toast, dismissToast };
}
