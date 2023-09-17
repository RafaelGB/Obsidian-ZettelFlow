import { AbstractDndManager } from "architecture/components/dnd";

export class SelectorDnDManager extends AbstractDndManager {
    public static init() {
        return new SelectorDnDManager();
    }
    async onDragStart() {
    }
}