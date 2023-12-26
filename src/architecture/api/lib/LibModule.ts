import { App } from "obsidian";

export abstract class LibModule {
    public abstract name: string;
    constructor(protected app: App) {

    }

    protected static_functions: Map<string, unknown> = new Map();
    protected static_object: { [x: string]: unknown };

    protected dynamic_functions: Map<string, unknown> = new Map();





    async init(): Promise<void> {
        await this.create_static_functions();
        this.static_object = Object.fromEntries(this.static_functions);
    }

    getName(): string {
        return this.name;
    }

    abstract create_static_functions(): Promise<void>;
    create_dynamic_functions(): Promise<void> {
        // By default, do nothing
        return Promise.resolve();
    }

    async generate_object(): Promise<Record<string, unknown>> {
        await this.create_dynamic_functions();

        return {
            ...this.static_object,
            ...Object.fromEntries(this.dynamic_functions),
        };
    }
}