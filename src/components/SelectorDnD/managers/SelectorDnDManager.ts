import { AbstractDndManager } from "architecture/components/dnd";

export class SelectorDnDManager extends AbstractDndManager {
    public static init() {
        return new SelectorDnDManager();
    }
    async onDragStart() {
    }

    onDragEnter(e: DragEvent) {
    }

    onDragLeave(e: DragEvent) {
    }

    async onDragEnd() {

    }

    async onDrop(e: DragEvent) {
    }
}