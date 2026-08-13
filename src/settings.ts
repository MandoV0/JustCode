const TOOL_AUTO_EXTEND_KEY = "justcode.toolAutoExtend";
const YOLO_MODE_KEY = "justcode.yoloMode";

export function getToolAutoExtend(): boolean {
    return localStorage.getItem(TOOL_AUTO_EXTEND_KEY) === "true";
}

export function setToolAutoExtend(value: boolean): void {
    localStorage.setItem(TOOL_AUTO_EXTEND_KEY, String(value));
}

export function getYoloMode(): boolean {
    return localStorage.getItem(YOLO_MODE_KEY) === "true";
}

export function setYoloMode(value: boolean): void {
    localStorage.setItem(YOLO_MODE_KEY, String(value));
}
