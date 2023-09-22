import { Entity, Hitbox } from "../model/CoreDnDModel";

export class EntityBuilder {
    private x: number;
    private y: number;
    public static init(): EntityBuilder {
        return new EntityBuilder();
    }
    setX(x: number): EntityBuilder {
        this.x = x;
        return this;
    }
    setY(y: number): EntityBuilder {
        this.y = y;
        return this;
    }
    build(): Entity {
        const minX = this.x - 75;
        const maxX = this.x + 75;
        const minY = this.y - 25;
        const maxY = this.y + 25;
        const hitbox: Hitbox = [minX, minY, maxX, maxY];
        return new DefaultEntity(hitbox);
    }
}


class DefaultEntity implements Entity {
    constructor(private initialHitbox: Hitbox) {
    }
    getHitbox(): Hitbox {
        return this.initialHitbox;
    }

}

function calculateDistance(x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function findClosestElement(x: number, y: number, className: string): HTMLDivElement | null {
    const elements = document.querySelectorAll(className);
    let closestElement: unknown = null;
    let closestDistance = Infinity;

    elements
        .forEach((element) => {
            if (!(element instanceof HTMLDivElement)) {
                return;
            }
            const rect = element.getBoundingClientRect();

            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distance = calculateDistance(x, y, centerX, centerY);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestElement = element;
            }
        });
    if (!closestElement || !(closestElement instanceof HTMLDivElement)) {
        return null;
    }
    return closestElement;
}