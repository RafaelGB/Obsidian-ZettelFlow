export interface AbstractHandler<T> {
    manageNextHandler(): void;
    handle(response: T): T;
}

export abstract class AbstractHandlerClass<T> implements AbstractHandler<T> {
    abstract name: string;
    abstract description: string; 
    protected nextHandler: AbstractHandler<T> | undefined;

    public goNext(response: T): T {
        // Check next handler
        if (this.nextHandler) {
            return this.nextHandler.handle(response);
        }
        return response;
    }

    public manageNextHandler(): void {
        this.nextHandler = undefined;
    }

    abstract handle(settingHandlerResponse: T): T;
}
