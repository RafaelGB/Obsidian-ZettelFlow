import { Coordinates } from "../model/CoreDnDModel";

export class StylesTool {
    public static getDragOverlayStyles(
        position: Coordinates,
        origin: Coordinates,
        transition = 'none'
    ): Partial<CSSStyleDeclaration> {
        const transformValue = `translate3d(${position.x - origin.x}px, ${position.y - origin.y}px, 0px)`;
        return {
            transform: transformValue,
            //width: `${adjustedHitbox[2] - adjustedHitbox[0]}px`,
            //height: `${adjustedHitbox[3] - adjustedHitbox[1]}px`,
            transition: transition,
        };
    }
}