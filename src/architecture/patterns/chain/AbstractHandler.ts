export interface AbstractHandler<T> {
    setNext(handler: AbstractHandler<T>): void;
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

    public setNext(handler: AbstractHandler<T>): void {
        this.nextHandler = undefined;
    }

    abstract handle(settingHandlerResponse: T): T;
}
