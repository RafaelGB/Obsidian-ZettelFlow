export interface AbstractHandler<T> {
    manageNextHandler(): void;
    handle(response: T): T;
    postAction(): void;
}

export abstract class AbstractHandlerClass<T> implements AbstractHandler<T> {
    abstract name: string;
    abstract description: string;
    protected nextHandler: AbstractHandler<T> | undefined;
    constructor() {
        this.manageNextHandler();
    }
    public getNenxtHandler(): AbstractHandler<T> | undefined {
        return this.nextHandler;
    }

    public goNext(response: T): T {
        // Check next handler
        if (this.nextHandler) {
            return this.nextHandler.handle(response);
        }
        return response;
    }

    public manageNextHandler(): void { }

    public setNextHandler(nextHandler: AbstractHandler<T>): void {
        this.nextHandler = nextHandler;
    }

    public nextPostAction(): void {
        if (this.nextHandler) {
            this.nextHandler.postAction();

        }
    }

    postAction(): void {
        this.nextPostAction();
    }

    abstract handle(settingHandlerResponse: T): T;
}
