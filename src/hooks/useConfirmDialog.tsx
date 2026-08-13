import { useCallback, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

interface ConfirmState {
    title: string;
    message: string;
    onConfirm: () => void;
}

export function useConfirmDialog() {
    const [state, setState] = useState<ConfirmState | null>(null);

    const askConfirm = useCallback((title: string, message: string, onConfirm: () => void) => {
        setState({ title, message, onConfirm });
    }, []);

    const confirmAction = useCallback(
        (title: string, message: string, action: () => void | Promise<void>) => {
            askConfirm(title, message, () => {
                void action();
            });
        },
        [askConfirm],
    );

    const dialog = (
        <ConfirmDialog
            open={state !== null}
            title={state?.title ?? ""}
            message={state?.message ?? ""}
            onConfirm={() => {
                state?.onConfirm();
                setState(null);
            }}
            onCancel={() => setState(null)}
        />
    );

    return { askConfirm, confirmAction, dialog };
}
