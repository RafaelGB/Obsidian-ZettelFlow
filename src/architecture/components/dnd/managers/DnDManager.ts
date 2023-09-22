import { c } from "architecture";
import { Coordinates, Entity } from "../model/CoreDnDModel";
import { StylesTool } from "../utils/StylesTool";
import { EntityBuilder, findClosestElement } from "../utils/EntityTool";

export abstract class AbstractDndManager {
    isDragging = false;
    dragEntity: Entity;
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
        draggable.classList.add(c('dragging'));
        draggable.classList.remove(c('droppable'));
        draggable.style.zIndex = '9999';
        this.dragOrigin = { x: pageX, y: pageY };
        this.dragPosition = { x: pageX, y: pageY };
        this.dragEntity = EntityBuilder
            .init()
            .setX(pageX)
            .setY(pageY)
            .build();
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
            const { pageX, pageY, clientX, clientY } = moveEvent;
            this.dragPosition = { x: pageX, y: pageY };
            // Apply styles to the dragged element
            const styleToApply = StylesTool.getDragOverlayStyles(
                this.dragPosition,
                this.dragOrigin
            );
            draggable.setCssStyles(styleToApply);
            // Find the closest droppable element
            const closestDroppable = findClosestElement(clientX, clientY, `.${c('droppable')}`);
            if (!closestDroppable) {
                return;
            }
            const { top, bottom } = closestDroppable.getBoundingClientRect();
            // Check if the dragged element is under the droppable element
            const isUnder = clientY > top && clientY < bottom;
            if (isUnder) {
                // Check is the pointer is nearest to the top or bottom
                const distance = Math.abs(top - clientY) - Math.abs(bottom - clientY);
                if (Math.abs(distance) < 30) {
                    const isNearTop = distance < 0;
                    // Move the droppable element to the top or bottom with a transition
                    const transition = '0.175s ease-in-out';
                    // Add a margin to the closest droppable element to make space for the dragged element
                    // The margin size should be equal to the height of the dragged element
                    const margin = isNearTop ? `${draggable.offsetHeight}px 0 0 0` : `0 0 ${draggable.offsetHeight}px 0`;
                    closestDroppable.setCssStyles({ margin, transition });
                }
            }
        }
        const onEnd = (endEvent: PointerEvent) => {
            view.removeEventListener('pointermove', onMove);
            view.removeEventListener('pointerup', onEnd);
            view.removeEventListener('pointercancel', onEnd);
            this.isDragging = false;
            draggable.classList.remove(c('dragging'));
            draggable.classList.add(c('droppable'));
            draggable.style.removeProperty('z-index');
            draggable.setCssStyles({ transform: 'translate3d(0px, 0px, 0px)', transition: '0.1s ease-in-out' });
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