import { AbstractDndManager } from "architecture/components/dnd";

export class SelectorDnDManager extends AbstractDndManager {
    public static init() {
        return new SelectorDnDManager();
    }
    async onDragStart() {
        console.log('drag starts custom');
    }
    async onDragOver(e: PointerEvent) {
        console.log('drag over custom');
    }

    async onDragEnd() {
        console.log('drag ends custom');
    }

    async onDrop(e: PointerEvent) {
        if (e.target instanceof HTMLElement) {
            console.log("dropped on html element");
        } else {
            console.log("dropped on something else");
        }
    }
}