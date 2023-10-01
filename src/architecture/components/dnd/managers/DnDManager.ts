import { c, log } from "architecture";
import { Coordinates, Dimensions, Entity } from "../model/CoreDnDModel";
import { StylesTool } from "../utils/StylesTool";
import { EntityBuilder, findClosestElement } from "../utils/EntityTool";
import { Platform } from "obsidian";

export abstract class AbstractDndManager {
    minDistance = 40;
    isDragging = false;
    dragEntity: Entity;
    initialEvent: PointerEvent;
    dragOrigin: Coordinates;
    dragPosition: Coordinates;
    initialTop: number;
    initialBottom: number;
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
        const { top, bottom } = draggable.getBoundingClientRect();
        this.initialBottom = bottom;
        this.initialTop = top;
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
            moveEvent.preventDefault();
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


            // Check if the dragged element is on the start position


            // Find the closest droppable element
            const closestDroppable = findClosestElement(clientX, clientY, `.${c('droppable')}`);
            if (!closestDroppable) {
                return;
            }
            const isOnStart = clientY > this.initialTop && clientY < this.initialBottom;
            if (isOnStart) {
                StylesTool.resetElement(closestDroppable, '0.1s ease-in-out');
                this.dropIndex = this.dragIndex;
                return;
            }
            const currentIndex = parseInt(closestDroppable.dataset.index || '0');

            if (this.elementCache.has(currentIndex)) {
                return;
            }
            const { top, bottom } = closestDroppable.getBoundingClientRect();
            // Check if the dragged element is under the droppable element
            const isUnder = clientY > top && clientY < bottom;

            if (isUnder) {
                // Check is the pointer is nearest to the top or bottom
                const distance = Math.abs(top - clientY) - Math.abs(bottom - clientY);
                if (Math.abs(distance) < this.minDistance) {
                    // Check if the droppable element is already moved
                    const moveToBottom = distance > 0;
                    // Move the droppable element to the top or bottom with a transition
                    const transition = '0.175s ease-in-out';
                    // Add a margin to the closest droppable element to make space for the dragged element
                    // The margin size should be equal to the height of the dragged element
                    const dimensions: Dimensions = draggable.getBoundingClientRect();
                    dimensions.height = moveToBottom ? dimensions.height : -dimensions.height;
                    StylesTool.shiftElement(closestDroppable, dimensions, transition);
                    this.elementCache.set(currentIndex, closestDroppable);
                    this.dropIndex = currentIndex;
                    this.removeCachedElementTimeout(currentIndex);
                }
            }
        }

        const onEnd = (endEvent: Event) => {
            endEvent.preventDefault();
            view.removeEventListener('pointermove', onMove);
            if (Platform.isMobile) {
                view.removeEventListener('touchend', onEnd);
                view.removeEventListener('touchcancel', onEnd);
            } else {
                view.removeEventListener('pointerup', onEnd);
                view.removeEventListener('pointercancel', onEnd);
            }
            this.isDragging = false;
            draggable.classList.remove(c('dragging'));
            draggable.classList.add(c('droppable'));
            draggable.style.removeProperty('z-index');
            StylesTool.resetElement(draggable, '0.1s ease-in-out');
            this.clearAllDroppables();
            this.onDrop();
        }

        view.addEventListener('pointermove', onMove);
        if (Platform.isMobile) {
            view.addEventListener('touchend', onEnd);
            view.addEventListener('touchcancel', onEnd);
        } else {
            view.addEventListener('pointerup', onEnd);
            view.addEventListener('pointercancel', onEnd);
        }
    }

    private removeCachedElementTimeout(index: number) {
        setTimeout(() => {
            this.elementCache.delete(index);
        }, 150);
    }

    private clearAllDroppables() {
        const droppables = document.querySelectorAll(`.${c("droppable")}`);
        droppables.forEach((droppable) => {
            if (!(droppable instanceof HTMLDivElement)) {
                return;
            }
            StylesTool.resetElement(droppable, '0.075s ease-in-out');
        });
    }

    abstract onDrop(): void;
}