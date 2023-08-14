import { Constructor } from "obsidian";

class TypeServiceManager {
    private static instance: TypeServiceManager;

    public isString(value: any): value is string {
        return typeof value === "string" || value instanceof String;
    }

    public isNumber(value: any): value is number {
        return typeof value === "number" && isFinite(value);
    }

    public isArray<T>(value: any, className: Constructor<T>): value is T[] {
        return value && typeof value === "object" && value.constructor === Array && value.every((item: any) => item instanceof className);
    }

    public isEmpty(value: Record<string, unknown> | null | undefined): boolean {
        return value == null || !(Object.keys(value) || value).length;
    }

    public static getInstance(): TypeServiceManager {
        if (!TypeServiceManager.instance) {
            TypeServiceManager.instance = new TypeServiceManager();
        }
        return TypeServiceManager.instance;
    }
}

export const TypeService = TypeServiceManager.getInstance();