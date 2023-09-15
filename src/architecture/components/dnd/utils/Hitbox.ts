import { Coordinates, Hitbox } from "../model/archDnDModel";

export const EMPTY_HITBOX: Hitbox = [0, 0, 0, 0];

export function distanceBetween(p1: Coordinates, p2: Coordinates) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

export function getHitboxDimensions(
    hitbox: Hitbox,
    margin: Hitbox = [0, 0, 0, 0]
) {
    const minX = hitbox[0] - margin[0];
    const minY = hitbox[1] - margin[1];
    const maxX = hitbox[2] + margin[2];
    const maxY = hitbox[3] + margin[3];

    const height = maxY - minY;
    const width = maxX - minX;

    return { width, height };
}