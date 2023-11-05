import { log } from "architecture";
import { Action, CustomZettelAction } from "../CustomZettelAction";

class ActionsStore {
    private static instance: ActionsStore;
    private actions: Map<string, CustomZettelAction>;
    private constructor() {
        this.actions = new Map();
    }

    public registerAction(action: CustomZettelAction): void {
        const key = action.id;
        if (this.actions.has(key)) {
            log.error(`Action ${key} already registered. Overriding`);
        }

        this.actions.set(key, action);
    }

    public unregisterAction(key: string): void {
        if (!this.actions.has(key)) {
            log.error(`Action ${key} not found`);
        }
        this.actions.delete(key);
    }

    public getAction(name: string): CustomZettelAction {
        const action = this.actions.get(name);
        if (!action) {
            log.error(`Action ${name} not found`);
            throw new Error(`Action ${name} not found`);
        }
        return action;
    }

    public getDefaultActionInfo(name: string): Action {
        const action = this.actions.get(name);
        if (!action) {
            log.error(`Action ${name} not found`);
            throw new Error(`Action ${name} not found`);
        }
        return action.defaultAction;
    }

    public unregisterAll(): void {
        this.actions.clear();
    }

    public getActionsKeys(): string[] {
        return Array.from(this.actions.keys());
    }

    public getIconOf(key: string): string {
        if (key === "bridge") {
            return "zettelflow-bridge-icon";
        }
        return this.getAction(key).getIcon();
    }
    public static getInstance(): ActionsStore {
        if (!ActionsStore.instance) {
            ActionsStore.instance = new ActionsStore();
        }
        return ActionsStore.instance;
    }
}

export const actionsStore = ActionsStore.getInstance();