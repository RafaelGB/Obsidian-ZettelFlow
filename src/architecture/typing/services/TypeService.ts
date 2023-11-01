type RecordToCheck = Record<string, unknown> | null | undefined;

export class TypeService {
    public static exists(value: unknown): value is true {
        return value != null && value !== undefined;
    }

    public static isString(value: unknown): value is string {
        return typeof value === "string" || value instanceof String;
    }

    public static isNumber(value: unknown): value is number {
        return typeof value === "number" && isFinite(value);
    }

    public static isBoolean(value: unknown): value is boolean {
        return typeof value === "boolean";
    }

    public static isArray<T>(value: object, typeOf: string): value is Array<T> {
        return value && typeof value === "object" && value.constructor === Array && (value as Array<T>).every((item: any) => typeof item === typeOf);
    }

    public static isDate(value: unknown): value is Date {
        const isDate = value instanceof Date;
        if (isDate) {
            return true;
        }
        if (TypeService.isString(value)) {
            return !isNaN(Date.parse(value));
        }
        return false;
    }

    public static isObject(value: object): value is Record<string, unknown> {
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