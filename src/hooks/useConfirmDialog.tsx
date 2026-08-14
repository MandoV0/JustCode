import { useCallback, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";

interface ConfirmState {
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
}

export function useConfirmDialog() {
    const [state, setState] = useState<ConfirmState | null>(null);

    const askConfirm = useCallback(
        (title: string, message: string, onConfirm: () => void, danger?: boolean) => {
            setState({ title, message, onConfirm, danger });
        },
        [],
    );

    const confirmAction = useCallback(
        (title: string, message: string, action: () => void | Promise<void>, danger?: boolean) => {
            askConfirm(title, message, () => {
                void action();
            }, danger);
        },
        [askConfirm],
    );

    const dialog = (
        <ConfirmDialog
            open={state !== null}
            title={state?.title ?? ""}
            message={state?.message ?? ""}
            danger={state?.danger ?? false}
            onConfirm={() => {
                state?.onConfirm();
                setState(null);
            }}
            onCancel={() => setState(null)}
        />
    );

    return { askConfirm, confirmAction, dialog };
}
