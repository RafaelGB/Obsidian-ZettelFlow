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

export function findElementsAbove(x: number, y: number, className: string): HTMLDivElement[] {
    const elements = document.querySelectorAll(className);
    const elementsAbove: HTMLDivElement[] = [];
    elements
        .forEach((element) => {
            if (!(element instanceof HTMLDivElement)) {
                return;
            }
            const rect = element.getBoundingClientRect();

            if (rect.top < y) {
                elementsAbove.push(element);
            }
        });
    return elementsAbove;
}

export function findElementsBelow(x: number, y: number, className: string): HTMLDivElement[] {
    const elements = document.querySelectorAll(className);
    const elementsBelow: HTMLDivElement[] = [];
    elements
        .forEach((element) => {
            if (!(element instanceof HTMLDivElement)) {
                return;
            }
            const rect = element.getBoundingClientRect();

            if (rect.top > y) {
                elementsBelow.push(element);
            }
        });
    return elementsBelow;
}