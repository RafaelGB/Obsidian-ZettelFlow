import { Constructor } from "obsidian";

type RecordToCheck = Record<string, unknown> | null | undefined;

export class TypeService {
    public static exists(value: unknown): value is true {
        return value != null && value !== undefined;
    }

    public static isString(value: any): value is string {
        return typeof value === "string" || value instanceof String;
    }

    public static isNumber(value: any): value is number {
        return typeof value === "number" && isFinite(value);
    }

    public static isArray<T>(value: any, className: Constructor<T>): value is T[] {
        return value && typeof value === "object" && value.constructor === Array && value.every((item: any) => item instanceof className);
    }

    public static recordIsEmpty(value: RecordToCheck): value is null | undefined {
        return value == null || !(Object.keys(value) || value).length;
    }

    public static recordHasOneKey(value: RecordToCheck): boolean {
        if (TypeService.exists(value)) {
            return Object.keys(value).length === 1;
        }
        return false;
    }

}