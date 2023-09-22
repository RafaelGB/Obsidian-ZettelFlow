import { c } from "architecture";
import { Coordinates } from "../model/CoreDnDModel";
import { StylesTool } from "../utils/StylesTool";
import { on } from "events";

export abstract class AbstractDndManager {
    isDragging = false;
    // Ephimerals
    initialEvent: PointerEvent;
    dragOrigin: Coordinates;
    dragPosition: Coordinates;

    public addListeners(droppable: HTMLDivElement) {
    }

    public removeListeners(droppable: HTMLDivElement) {

    }

    async dragStart(startEvent: PointerEvent, draggable: HTMLDivElement) {
        const { view, pageX, pageY } = startEvent;
        if (!view) {
            return;
        }
        this.initialEvent = startEvent;
        this.isDragging = true;
        draggable.style.display = 'block';
        draggable.classList.add(c('dragging'));
        draggable.classList.remove(c('droppable'));
        this.dragOrigin = { x: pageX, y: pageY };
        this.dragPosition = { x: pageX, y: pageY };
        // Obtain coordinates of the dragged element
        // this.draggedElement.getBoundingClientRect();
        const onMove = (moveEvent: PointerEvent) => {
            if (!this.isDragging) {
                view.removeEventListener('pointermove', onMove);
                view.removeEventListener('pointerup', onEnd);
                view.removeEventListener('pointercancel', onEnd);
                console.warn('move event called without dragging');
                return;
            }
            const { pageX, pageY } = moveEvent;
            this.dragPosition = { x: pageX, y: pageY };
            //this.calculateDragIntersect();
            const styleToApply = StylesTool.getDragOverlayStyles(
                this.dragPosition,
                this.dragOrigin,
                [0, 0, 0, 0],
                [0, 0, 0, 0]
            );
            draggable.setCssStyles(styleToApply);
            console.log("move");
        }
        const onEnd = (endEvent: PointerEvent) => {
            view.removeEventListener('pointermove', onMove);
            view.removeEventListener('pointerup', onEnd);
            view.removeEventListener('pointercancel', onEnd);
            this.isDragging = false;
            console.log("end");
        }

        view.addEventListener('pointermove', onMove);
        view.addEventListener('pointerup', onEnd);
        view.addEventListener('pointercancel', onEnd);
    }
    /*
    async drop(e: DragEvent) {
        e.preventDefault();
        const child = this.draggedElement.querySelector(`.${c('droppable-item-dataset')}`);
        if (!child || !(child instanceof HTMLDivElement)) {
            return;
        }
        const { index } = child.dataset;
        // Remove drag_over class from all droppable elements
        const droppables = activeDocument.querySelectorAll(`.${c('droppable')}`);
        droppables.forEach(droppable => droppable.classList.remove(c('drag-over')));
    }
    */
}