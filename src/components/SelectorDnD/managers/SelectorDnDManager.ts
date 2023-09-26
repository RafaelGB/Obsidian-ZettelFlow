import { log } from "architecture";
import { AbstractDndManager } from "architecture/components/dnd";

export class SelectorDnDManager extends AbstractDndManager {
    public static init(callback: (indexSwap1: number, indexSwap2: number) => void) {
        return new SelectorDnDManager(callback);
    }
    constructor(private callback: (indexSwap1: number, indexSwap2: number) => void) {
        super();
    }
    public onDrop(): void {
        if (this.dragIndex === this.dropIndex) {
            log.trace(`SelectorDnDManager.onDrop: ${this.dragIndex} === ${this.dropIndex}`);
        } else {
            log.trace(`SelectorDnDManager.onDrop: ${this.dragIndex} !== ${this.dropIndex}`);
            this.callback(this.dragIndex, this.dropIndex);
        }
    }
}