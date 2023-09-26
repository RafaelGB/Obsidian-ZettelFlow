import { c, log } from "architecture";
import { Coordinates, Dimensions, Entity } from "../model/CoreDnDModel";
import { StylesTool } from "../utils/StylesTool";
import { EntityBuilder, findClosestElement } from "../utils/EntityTool";

export abstract class AbstractDndManager {
    minDistance = 40;
    isDragging = false;
    isAnimating = false;
    dragEntity: Entity;
    initialEvent: PointerEvent;
    dragOrigin: Coordinates;
    dragPosition: Coordinates;
    dragIndex: number;
    dropIndex: number;
    elementCache: Map<number, HTMLDivElement> = new Map();

    async dragStart(startEvent: PointerEvent, draggable: HTMLDivElement) {
        const { view, pageX, pageY } = startEvent;
        if (!view) {
            return;
        }
        this.initialEvent = startEvent;
        this.isDragging = true;
        draggable.classList.add(c('dragging'));
        draggable.classList.remove(c('droppable'));
        draggable.style.zIndex = '99999';
        this.dragIndex = parseInt(draggable.dataset.index || '0');
        this.dropIndex = parseInt(draggable.dataset.index || '0');
        this.dragOrigin = { x: pageX, y: pageY };
        this.dragPosition = { x: pageX, y: pageY };
        this.dragEntity = EntityBuilder
            .init()
            .setX(pageX)
            .setY(pageY)
            .build();
        const onMove = (moveEvent: PointerEvent) => {
            if (!this.isDragging) {
                view.removeEventListener('pointermove', onMove);
                view.removeEventListener('pointerup', onEnd);
                view.removeEventListener('pointercancel', onEnd);
                log.warn('move event called without dragging');
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
            if (this.isAnimating) {
                return;
            }
            // Find the closest droppable element
            const closestDroppable = findClosestElement(clientX, clientY, `.${c('droppable')}`);
            if (!closestDroppable) {
                return;
            }
            const { top, bottom } = closestDroppable.getBoundingClientRect();
            const { top: draggableTop, bottom: draggableBottom } = draggable.getBoundingClientRect();
            // Check if the dragged element is on the start position
            const isOnStart = draggableTop > top && draggableBottom < bottom;

            if (isOnStart) {
                StylesTool.resetElement(closestDroppable, '0.175s ease-in-out');
                return;
            }
            // Check if the dragged element is under the droppable element
            const isUnder = clientY > top && clientY < bottom;

            if (isUnder) {
                // Check is the pointer is nearest to the top or bottom
                const distance = Math.abs(top - clientY) - Math.abs(bottom - clientY);
                if (Math.abs(distance) < this.minDistance) {
                    const currentIndex = parseInt(closestDroppable.dataset.index || '0');
                    // Check if the droppable element is already moved
                    if (this.elementCache.has(currentIndex)) {
                        StylesTool.resetElement(closestDroppable, '0.175s ease-in-out');
                        this.elementCache.delete(currentIndex);
                    } else {

                        const moveToBottom = currentIndex < this.dragIndex;
                        //const canMoveUp = draggableTop < top;

                        // Move the droppable element to the top or bottom with a transition
                        const transition = '0.175s ease-in-out';
                        // Add a margin to the closest droppable element to make space for the dragged element
                        // The margin size should be equal to the height of the dragged element
                        const dimensions: Dimensions = draggable.getBoundingClientRect();
                        dimensions.height = moveToBottom ? dimensions.height : -dimensions.height;
                        StylesTool.shiftElement(closestDroppable, dimensions, transition);
                        this.elementCache.set(currentIndex, closestDroppable);
                        this.dropIndex = currentIndex;
                        this.triggerAnimationFlag();
                    }
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
            StylesTool.resetElement(draggable, '0.1s ease-in-out');
            this.clearMovedDroppables();
            this.onDrop();
        }

        view.addEventListener('pointermove', onMove);
        view.addEventListener('pointerup', onEnd);
        view.addEventListener('pointercancel', onEnd);
    }
    private triggerAnimationFlag() {
        this.isAnimating = true;
        // Remove animation after the transition is finished
        setTimeout(() => {
            this.isAnimating = false;
        }, 125);
    }

    private clearMovedDroppables() {
        const resetedIndexes: number[] = [];
        // Reset and remove the droppables below the dragged element index and the last droppable index
        // Iterate over the droppables in the cache
        this.elementCache.forEach((droppable, key) => {
            // Reset the droppable element
            StylesTool.resetElement(droppable, '0.125s ease-in-out');
            resetedIndexes.push(key);

        });
        resetedIndexes.forEach((index) => {
            this.elementCache.delete(index);
        });
        this.triggerAnimationFlag();
    }

    abstract onDrop(): void;
}