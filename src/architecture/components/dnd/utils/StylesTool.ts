import { Coordinates, Dimensions } from "../model/CoreDnDModel";

export class StylesTool {
    public static getDragOverlayStyles(
        position: Coordinates,
        origin: Coordinates,
        transition = 'none'
    ): Partial<CSSStyleDeclaration> {
        const transformValue = `translate3d(${position.x - origin.x}px, ${position.y - origin.y}px, 0px)`;
        return {
            transform: transformValue,
            transition: transition,
        };
    }
    public static dimensionsOf(element: HTMLElement): Dimensions {
        const transform = element.style.getPropertyValue('transform');
        if (!transform) {
            return { width: 0, height: 0 };
        }
        const [, height] = transform.split(',');
        return { width: 0, height: parseInt(height) };
    }

    public static shiftElement(element: HTMLElement, dimensions: Dimensions, transition = 'none') {
        // Check if the element was already moved. If so and the height is the same, do nothing
        const currentElementDimension = this.dimensionsOf(element);
        if (currentElementDimension.height != 0 && (currentElementDimension.height > 0) !== (dimensions.height > 0)) {
            this.resetElement(element, transition);
        } else {
            const shift = `translate3d(0, ${dimensions.height}px, 0)`;

            this.setStyle(element, 'transition', transition);
            this.setStyle(element, 'transform', shift);
        }
    }

    public static resetElement(element: HTMLElement, transition = 'none') {
        this.setStyle(element, 'transition', transition);
        this.setStyle(element, 'transform', 'translate3d(0, 0, 0)');
        this.removeStyle(element, 'display');
    }

    private static setStyle(el: HTMLElement, property: string, value: string) {
        if (el.style.getPropertyValue(property) !== value) {
            el.style.setProperty(property, value);
        }
    }

    private static removeStyle(el: HTMLElement, property: string) {
        if (el.style.getPropertyValue(property)) {
            el.style.removeProperty(property);
        }
    }

}