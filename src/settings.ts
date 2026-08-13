function createBooleanSetting(key: string) {
    return {
        get: () => localStorage.getItem(key) === "true",
        set: (value: boolean) => localStorage.setItem(key, String(value)),
    };
}

const toolAutoExtend = createBooleanSetting("justcode.toolAutoExtend");
const yoloMode = createBooleanSetting("justcode.yoloMode");

export const getToolAutoExtend = toolAutoExtend.get;
export const setToolAutoExtend = toolAutoExtend.set;
export const getYoloMode = yoloMode.get;
export const setYoloMode = yoloMode.set;
