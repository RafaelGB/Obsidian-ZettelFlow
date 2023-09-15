import { create } from "zustand";
import { DnDManagerState } from "../model/DnDManagerStateModel";
import { AbstractDndManager } from "../managers/DnDManager";

export const useDnDManager = create<DnDManagerState>((set, get) => ({
    scopes: new Map(),
    scopeActions: {
        addScope: (uniqueId: string, manager: AbstractDndManager) => {
            const { scopes } = get();
            if (scopes.has(uniqueId)) {
                return false;
            }
            scopes.set(uniqueId, manager);
            set({ scopes: scopes });
            return true;
        },
        removeScope: (uniqueId: string) => {
            const { scopes } = get();
            if (!scopes.has(uniqueId)) {
                return false;
            }
            scopes.delete(uniqueId);
            set({ scopes: scopes });
            return true;
        }
    }
}));