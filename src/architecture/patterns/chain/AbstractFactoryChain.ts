import { AbstractHandler } from "./AbstractHandler";


export abstract class AbstractChain<T> {
    /**
     * Implement this method to customize the chain info before the handlers are run
     * @param abstractInfo 
     * @returns 
     */
    protected before(abstractInfo: T): T {
        return abstractInfo;
    }
    protected after(abstractInfo: T): T {
        return abstractInfo;
    }

    public run(abstractInfo: T): T {
        // Obtain the group of handlers
        const mainHandler = this.starter();

        // If there is no handler, return the original info
        if (!mainHandler) {
            return abstractInfo;
        }
        // Customize the info before the chain
        abstractInfo = this.before(abstractInfo);
        // Run the chain
        abstractInfo = mainHandler.handle(abstractInfo);
        // Customize the info after the chain
        return this.after(abstractInfo);
    }
    protected abstract starter(): AbstractHandler<T>;
}