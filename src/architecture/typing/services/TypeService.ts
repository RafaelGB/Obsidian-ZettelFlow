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

    public static isArray<T>(value: any, typeOf: string): value is Array<T> {
        return value && typeof value === "object" && value.constructor === Array && value.every((item: any) => typeof item === typeOf);
    }

    public static isObject(value: any): value is Record<string, unknown> {
        return value && typeof value === "object" && value.constructor === Object;
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

    public static recordHasMultipleKeys(value: RecordToCheck): boolean {
        if (TypeService.exists(value)) {
            return Object.keys(value).length > 1;
        }
        return false;
    }

}