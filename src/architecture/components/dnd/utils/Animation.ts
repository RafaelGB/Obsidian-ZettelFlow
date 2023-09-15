import { Coordinates } from "../model/archDnDModel";

export const TIMINGS = {
    outOfTheWay: 200,
    minDropTime: 330,
    maxDropTime: 550,
};

export const DROP_TIME_RANGE = TIMINGS.maxDropTime - TIMINGS.minDropTime;

export const MAX_DROP_TIME_AT_DISTANCE = 1500;
export const CANCEL_DROP_MODIFIER = 0.6;

export const curves = {
    outOfTheWay: 'cubic-bezier(0.2, 0, 0, 1)',
    drop: 'cubic-bezier(.2,1,.1,1)',
};

const outOfTheWayTiming: string = `${TIMINGS.outOfTheWay}ms ${curves.outOfTheWay}`;

export const transitions = {
    none: `none`,
    fluid: `opacity ${outOfTheWayTiming}`,
    snap: `transform ${outOfTheWayTiming}, opacity ${outOfTheWayTiming}`,
    drop: (duration: number): string => {
        const timing: string = `${duration}ms ${curves.drop}`;
        return `transform ${timing}, opacity ${timing}`;
    },
    outOfTheWay: `transform ${outOfTheWayTiming}`,
    placeholder: `height ${outOfTheWayTiming}, width ${outOfTheWayTiming}, margin ${outOfTheWayTiming}, border-color ${outOfTheWayTiming}`,
};

export const isEqual = (point1: Coordinates, point2: Coordinates): boolean =>
    point1.x === point2.x && point1.y === point2.y;


const moveTo = (offset: Coordinates): string | undefined =>
    isEqual(offset, origin)
        ? undefined
        : `translate(${offset.x}px, ${offset.y}px)`;

export const origin: Coordinates = { x: 0, y: 0 };

export const transforms = {
    moveTo,
    drop: (offset: Coordinates) => {
        return moveTo(offset);
    },
};

export function setStyle(el: HTMLElement, property: string, value: string) {
    if (el.style.getPropertyValue(property) !== value) {
        el.style.setProperty(property, value);
    }
}

export function removeStyle(el: HTMLElement, property: string) {
    if (el.style.getPropertyValue(property)) {
        el.style.removeProperty(property);
    }
}