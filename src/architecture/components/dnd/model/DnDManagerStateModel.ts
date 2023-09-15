import { AbstractDndManager } from "../managers/DnDManager";

export interface ScopeActions {
    addScope: (uniqueId: string, manager: AbstractDndManager) => boolean;
    removeScope: (uniqueId: string) => boolean;
}
export interface DnDManagerState {
    scopes: Map<string, AbstractDndManager>;
    scopeActions: ScopeActions;
}