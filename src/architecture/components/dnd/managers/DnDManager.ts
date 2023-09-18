export abstract class AbstractDndManager {
    isDragging = false;
    // Ephimerals
    initialEvent: PointerEvent;
    currentDroppable: HTMLDivElement;

    public addListeners(droppable: HTMLDivElement) {
        droppable.addEventListener('dragover', this.dragOver.bind(this));
        droppable.addEventListener('dragend', this.dragEnds.bind(this));
        droppable.addEventListener('drop', this.drop.bind(this));
    }

    public removeListeners(droppable: HTMLDivElement) {
        droppable.removeEventListener('dragover', this.dragOver.bind(this));
        droppable.removeEventListener('dragend', this.dragEnds.bind(this));
        droppable.removeEventListener('drop', this.drop.bind(this));
    }

    async dragStart(e: PointerEvent, droppable: HTMLDivElement) {
        this.currentDroppable = droppable;
        this.initialEvent = e;
        this.isDragging = true;
        this.currentDroppable.draggable = true;
        await this.onDragStart();
    }

    async dragOver(e: PointerEvent) {
        e.preventDefault();
        await this.onDragOver(e);
    }

    async dragEnds(e: PointerEvent) {
        this.currentDroppable.draggable = false;
        this.isDragging = false;
        await this.onDragEnd();
    }

    async drop(e: PointerEvent) {
        await this.onDrop(e);
    }


    abstract onDragStart(): Promise<void>;
    abstract onDragEnd(): Promise<void>;
    abstract onDragOver(e: PointerEvent): Promise<void>;
    abstract onDrop(e: PointerEvent): Promise<void>;
}