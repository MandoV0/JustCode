import { invoke } from "./bridge";

export interface ApiProject {
    id: string;
    name: string;
    path: string;
}

export function listProjects(): Promise<ApiProject[]> {
    return invoke<ApiProject[]>("list_projects");
}

export function getActiveProjectId(): Promise<string | null> {
    return invoke<string | null>("get_active_project");
}

export function saveProject(project: ApiProject): Promise<ApiProject[]> {
    return invoke<ApiProject[]>("save_project", { project });
}

export function deleteProject(id: string): Promise<ApiProject[]> {
    return invoke<ApiProject[]>("delete_project", { id });
}

export function setActiveProject(id: string): Promise<string | null> {
    return invoke<string | null>("set_active_project", { id });
}

export function pickFolder(): Promise<string | null> {
    return invoke<string | null>("pick_folder");
}
