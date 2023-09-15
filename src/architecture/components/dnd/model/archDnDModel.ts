import { CSSProperties, ReactNode } from "react";

// [minX, minY, maxX, maxY]
export type Hitbox = [number, number, number, number];
export type Path = number[];
export type Axis = 'horizontal' | 'vertical';

export interface Entity {
    getPath(): Path;
    getHitbox(): Hitbox;
    getData(): ScopedEntityData;
    recalcInitial(): void;
    //getParentScrollState(): ScrollState;
    //getParentScrollShift(): CoordinateShift;

    scopeId: string;
    entityId: string;
    initial: Hitbox;
}

export interface Coordinates {
    x: number;
    y: number;
}

export interface DragEventData {
    dragEntity?: Entity;
    dragEntityId?: string;
    dragEntityMargin?: Hitbox;
    dragOrigin?: Coordinates;
    dragOriginHitbox?: Hitbox;
    dragPosition?: Coordinates;
    primaryIntersection?: Entity;
    scrollIntersections?: [Entity, number][];
}

export interface DragOverlayProps {
    children(entity: Entity, styles: CSSProperties): JSX.Element;
}

export interface EntityData {
    type: string;
    id: string;
    accepts: string[];
    sortAxis?: Axis;
    [k: string]: any;
}

export interface ScopedEntityData extends EntityData {
    win: Window;
}

export interface ScopeProps {
    id?: string;
}

export interface SortableProps {
    axis: Axis;
    onSortChange?: (isSorting: boolean) => void;
}

export enum SiblingDirection {
    Before,
    After,
    Self,
    NotSiblings,
}

export type EntityAndElement = [Entity, HTMLElement, HTMLElement];

export interface Dimensions {
    width: number;
    height: number;
}