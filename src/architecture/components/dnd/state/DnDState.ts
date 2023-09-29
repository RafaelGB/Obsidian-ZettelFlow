import { create } from "zustand";
import { DnDManagerState } from "../model/DnDManagerStateModel";
import { AbstractDndManager } from "../managers/DnDManager";
import { log } from "architecture";

export const useDnDManager = create<DnDManagerState>((set, get) => ({
    scopes: new Map(),
    getScope: (managerId: string) => {
        const { scopes } = get();
        return scopes.get(managerId);
    },
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
                log.warn(`Scope ${uniqueId} not found. Nothing to remove.`);
                return false;
            }
            log.debug(`Removing scope ${uniqueId}`);
            scopes.delete(uniqueId);
            set({ scopes: scopes });
            return true;
        }
    }

}));