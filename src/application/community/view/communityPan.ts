import { CameraPan, type Span } from "architecture/components/core/surface/cameraPan";

/**
 * **The room pan** (#798, epic #797): the camera moves along the room strip, so the room you chose
 * arrives from the side it lives on — never a swap (§XVI). It is the one {@link CameraPan} every set
 * shares (#875: Home's three modes are the other), placed by the Community's own custom properties.
 */

export { AWAY, armSkip, ownWindow, settledWithin, type PanShot, type Span } from "architecture/components/core/surface/cameraPan";

/** The custom property the strip's `transform` is computed from: the index of the room in view. */
export const ROOM_PROP = "--zf-community-room";
/** The indicator's place under its tab, in pixels: where it starts, and how wide it is. */
export const INDICATOR_X = "--zf-community-ind-x";
export const INDICATOR_W = "--zf-community-ind-w";

const PROPS = { at: ROOM_PROP, indX: INDICATOR_X, indW: INDICATOR_W };

/** The Community's pan: the shared camera, on the Community's properties. */
export class CommunityPan extends CameraPan {
    constructor() {
        super(PROPS);
    }
}

export function placeIndicator(el: HTMLElement | undefined, span: Span | null): void {
    new CameraPan(PROPS).placeIndicator(el, span);
}
