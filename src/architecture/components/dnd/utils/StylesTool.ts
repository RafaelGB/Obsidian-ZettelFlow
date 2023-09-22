import { Coordinates, Hitbox } from "../model/CoreDnDModel";

export class StylesTool {
    public static getDragOverlayStyles(
        position: Coordinates,
        origin: Coordinates,
        originHitbox: Hitbox,
        margin: Hitbox,
        transition = 'none'
    ): Partial<CSSStyleDeclaration> {
        const adjustedHitbox = [
            originHitbox[0] - margin[0],
            originHitbox[1] - margin[1],
            originHitbox[2] + margin[2],
            originHitbox[3] + margin[3],
        ];

        return {
            transform:
                `translate3d(${position.x - origin.x + adjustedHitbox[0]}px, ${position.y - origin.y + adjustedHitbox[1]
                }px, 0px)`,
            width: `${adjustedHitbox[2] - adjustedHitbox[0]}px`,
            height: `${adjustedHitbox[3] - adjustedHitbox[1]}px`,
            transition: transition,
        };
    }
}