import { log } from "architecture";

export abstract class AbstractDndManager {
    isDragging = false;
    // Ephimerals
    initialEvent: PointerEvent;
    currentDroppable: HTMLDivElement;
    async dragStart(e: PointerEvent, droppable: HTMLDivElement) {
        log.trace(`drag starts`);
        this.currentDroppable = droppable;
        this.initialEvent = e;
        this.isDragging = true;
        this.currentDroppable.draggable = true;
        await this.onDragStart();
        droppable.addEventListener('dragend', this.dragEnds.bind(this));
    }

    async dragEnds() {
        this.currentDroppable.draggable = false;
        this.isDragging = false;
        this.currentDroppable.removeEventListener('dragend', this.dragEnds);
    }
    abstract onDragStart(): Promise<void>;

}