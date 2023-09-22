import { c } from "architecture";

export abstract class AbstractDndManager {
    isDragging = false;
    // Ephimerals
    initialEvent: PointerEvent;
    draggedElement: HTMLDivElement;
    hoveredIndex: number;

    public addListeners(droppable: HTMLDivElement) {
        droppable.addEventListener('drag', this.drag.bind(this));
        droppable.addEventListener('dragover', this.dragOver.bind(this));
        droppable.addEventListener('dragenter', this.dragEnter.bind(this));
        droppable.addEventListener('dragleave', this.dragLeave.bind(this));
        droppable.addEventListener('dragend', this.dragEnds.bind(this));
        droppable.addEventListener('drop', this.drop.bind(this));
    }

    public removeListeners(droppable: HTMLDivElement) {
        droppable.removeEventListener('drag', this.drag.bind(this));
        droppable.removeEventListener('dragover', this.dragOver.bind(this));
        droppable.removeEventListener('dragenter', this.dragEnter.bind(this));
        droppable.removeEventListener('dragleave', this.dragLeave.bind(this));
        droppable.removeEventListener('dragend', this.dragEnds.bind(this));
        droppable.removeEventListener('drop', this.drop.bind(this));
    }

    async drag(e: PointerEvent) {
        e.preventDefault();
        // Check where the dragged element is
        // Obtain the first element that is droppable
        const element = activeDocument
            .elementsFromPoint(e.clientX, e.clientY)
            .find(element => element instanceof HTMLDivElement && element.dataset.isDroppable === 'true');
        if (!element || !(element instanceof HTMLDivElement)) {
            return;
        }
        const { isDroppable } = element.dataset;
        if (isDroppable === 'true') {
            //await this.moveDraggedElement(e, element);

            const { clientY } = e;
            const { top, bottom } = element.getBoundingClientRect();
            // Check is the pointer is nearest to the top or bottom
            const isNearTop = Math.abs(top - clientY) < Math.abs(bottom - clientY);
            // In function of the position of the pointer, translate the element
            if (isNearTop) {
                console.log('top');
            } else {
                console.log('bottom');
            }
        }

    }

    async moveDraggedElement(e: PointerEvent, droppable: HTMLDivElement) {
        // Move the dragged element to the pointer position
        const { clientX, clientY } = e;
        droppable.style.transform = `translate(${clientX}px, ${clientY}px)`;
    }

    async dragStart(e: PointerEvent, droppable: HTMLDivElement) {
        this.initialEvent = e;
        this.isDragging = true;
        droppable.draggable = true;
        droppable.style.display = 'block';
        droppable.classList.add(c('dragging'));
        droppable.classList.remove(c('droppable'));
        this.draggedElement = droppable;

        // Obtain coordinates of the dragged element
        // this.draggedElement.getBoundingClientRect();
        await this.onDragStart();
    }

    async dragOver(e: DragEvent) {
        e.preventDefault();
    }

    dragEnter(e: DragEvent) {
        const element = e.currentTarget;
        if (!(element instanceof HTMLDivElement) || !element.classList.contains(c('droppable'))) {
            return;
        }
        element.classList.add(c('drag-over'));
        // Find a child of the element with the class 'droppable-item-dataset'
        const child = element.querySelector(`.${c('droppable-item-dataset')}`);
        if (!child || !(child instanceof HTMLDivElement)) {
            return;
        }

        const { index } = child.dataset;
        this.hoveredIndex = parseInt(index || '-1');
        this.onDragEnter(e);
        console.log(`enter into: ${this.hoveredIndex}`);
    }

    dragLeave(e: DragEvent) {
        e.preventDefault();
        const element = e.currentTarget;
        if (!(element instanceof HTMLDivElement)) {
            return;
        }
        element.classList.remove(c('drag-over'));
        this.onDragLeave(e);
        console.log(`leave from: ${this.hoveredIndex}`);
    }

    async dragEnds(e: PointerEvent) {
        e.preventDefault();
        this.draggedElement.draggable = false;
        this.isDragging = false;
        this.draggedElement.style.removeProperty('display');
        this.draggedElement.classList.remove(c('dragging'));
        this.draggedElement.classList.add(c('droppable'));

        await this.onDragEnd();
    }

    async drop(e: DragEvent) {
        e.preventDefault();
        const child = this.draggedElement.querySelector(`.${c('droppable-item-dataset')}`);
        if (!child || !(child instanceof HTMLDivElement)) {
            return;
        }
        const { index } = child.dataset;
        console.log(`changed from ${index} to ${this.hoveredIndex}`);
        // Remove drag_over class from all droppable elements
        const droppables = activeDocument.querySelectorAll(`.${c('droppable')}`);
        droppables.forEach(droppable => droppable.classList.remove(c('drag-over')));
        await this.onDrop(e);
    }


    abstract onDragStart(): Promise<void>;
    abstract onDragEnter(e: DragEvent): void;
    abstract onDragLeave(e: DragEvent): void;
    abstract onDragEnd(): Promise<void>;
    abstract onDrop(e: DragEvent): Promise<void>;
}