export abstract class ZettelError extends Error {
    public static WARNING_TYPE = "warning";
    public static FATAL_TYPE = "fatal";
    protected type: string;
    protected code: string;
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
    getType(): string {
        return this.type;
    }
    getCode(): string {
        return this.code;
    }
    setCode(code: string): ZettelError {
        this.code = code;
        return this;
    }
}

export class WarningError extends ZettelError {
    constructor(message: string) {
        super(message);
        this.type = ZettelError.WARNING_TYPE;
    }
}

export class FatalError extends ZettelError {
    public static INVALID_TITLE = "invalid-title";
    constructor(message: string) {
        super(message);
        this.type = ZettelError.FATAL_TYPE;
    }
}