import { invoke } from "./bridge";

export interface ApiConfig {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    enableThinking: boolean;
    strictMode: boolean;
    thinkingOptions: string[];
    maxContextTokens: number;
}

export function listApiConfigs(): Promise<ApiConfig[]> {
    return invoke<ApiConfig[]>("list_api_configs");
}

export function getActiveApiConfigId(): Promise<string | null> {
    return invoke<string | null>("get_active_api_config");
}

export function saveApiConfig(config: ApiConfig): Promise<ApiConfig[]> {
    return invoke<ApiConfig[]>("save_api_config", { config });
}

export function deleteApiConfig(id: string): Promise<ApiConfig[]> {
    return invoke<ApiConfig[]>("delete_api_config", { id });
}

export function setActiveApiConfig(id: string): Promise<string | null> {
    return invoke<string | null>("set_active_api_config", { id });
}
