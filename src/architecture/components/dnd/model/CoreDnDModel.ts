export type Axis = 'horizontal' | 'vertical';
export type Coordinates = { x: number; y: number };
export type Dimensions = { width: number; height: number };
export type Hitbox = [number, number, number, number];


export interface Entity {
    getHitbox(): Hitbox;
}