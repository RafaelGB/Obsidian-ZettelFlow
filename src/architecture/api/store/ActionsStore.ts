import { log } from "architecture";
import { CustomZettelAction } from "../CustomZettelAction";
import { AbstractHandlerClass } from "architecture/patterns";
import { StepBuilderModal } from "zettelkasten";

class ActionsStore {
    private static instance: ActionsStore;
    private actions: Map<string, CustomZettelAction>;
    private initialChain: string;
    private lastRegistered: string;
    private constructor() {
        this.actions = new Map();
    }

    public registerAction(action: CustomZettelAction): void {
        const key = action.id;
        if (this.actions.has(key)) {
            log.error(`Action ${key} already registered. Overriding`);
        }

        if (!this.initialChain) {
            this.initialChain = key;
        } else {
            this.addNextHandlerOn(this.lastRegistered, action.stepHandler);
        }
        this.actions.set(key, action);
        this.lastRegistered = key;
    }

    public unregisterAction(key: string): void {
        if (!this.actions.has(key)) {
            log.error(`Action ${key} not found`);
        }
        this.actions.delete(key);
    }

    private addNextHandlerOn(key: string, handler: AbstractHandlerClass<StepBuilderModal>): void {
        const action = this.getAction(key);
        action.stepHandler.setNextHandler(handler);
        this.actions.set(key, action);
    }

    public getAction(name: string): CustomZettelAction {
        const action = this.actions.get(name);
        if (!action) {
            log.error(`Action ${name} not found`);
            throw new Error(`Action ${name} not found`);
        }
        return action;
    }

    public unregisterAll(): void {
        this.actions.clear();
    }

    public getActionsKeys(): string[] {
        return Array.from(this.actions.keys());
    }

    public getInitialChain(): AbstractHandlerClass<StepBuilderModal> {
        return this.getAction(this.initialChain).stepHandler;
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