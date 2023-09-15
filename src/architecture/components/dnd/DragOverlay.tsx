import { CSSProperties, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Coordinates,
  DragEventData,
  DragOverlayProps,
  Entity,
  Hitbox,
} from "./model/archDnDModel";
import { EMPTY_HITBOX, distanceBetween } from "./utils/Hitbox";
import {
  CANCEL_DROP_MODIFIER,
  DROP_TIME_RANGE,
  MAX_DROP_TIME_AT_DISTANCE,
  TIMINGS,
  transforms,
  transitions,
} from "./utils/Animation";

export function DragOverlay({ children }: DragOverlayProps) {
  const dndManager: any = {};

  const [dragEntity, setDragEntity] = useState<Entity | undefined>();
  const [styles, setStyles] = useState<CSSProperties | undefined>();

  useEffect(() => {
    if (!dndManager) return;

    let dragOriginHitbox: Hitbox = EMPTY_HITBOX;

    const dragStart = ({
      dragEntity,
      dragOrigin,
      dragPosition,
      dragEntityMargin,
    }: DragEventData) => {
      if (!dragEntity || !dragPosition || !dragOrigin) {
        return;
      }
      dragOriginHitbox = dragEntity.getHitbox();
      setDragEntity(dragEntity);
      setStyles(
        getDragOverlayStyles(
          dragPosition,
          dragOrigin,
          dragOriginHitbox,
          dragEntityMargin || EMPTY_HITBOX
        )
      );
    };

    const dragMove = ({
      dragOrigin,
      dragPosition,
      dragEntityMargin,
    }: DragEventData) => {
      if (!dragPosition || !dragOrigin) {
        return;
      }
      setStyles(
        getDragOverlayStyles(
          dragPosition,
          dragOrigin,
          dragOriginHitbox,
          dragEntityMargin || EMPTY_HITBOX
        )
      );
    };

    const dragEnd = ({
      dragOrigin,
      primaryIntersection,
      dragPosition,
      dragEntityMargin,
    }: DragEventData) => {
      if (primaryIntersection && dragPosition && dragOrigin) {
        const dropHitbox = primaryIntersection.getHitbox();
        const dropDestination = {
          x: dropHitbox[0],
          y: dropHitbox[1],
        };
        const dropDuration = getDropDuration({
          position: dragPosition,
          destination: dropDestination,
        });

        const transition = transitions.drop(dropDuration);
        const transform = transforms.drop(dropDestination);

        setStyles(
          getDragOverlayStyles(
            dragPosition,
            dragOrigin,
            dragOriginHitbox,
            dragEntityMargin || EMPTY_HITBOX,
            transition,
            transform
          )
        );

        activeWindow.setTimeout(() => {
          setDragEntity(undefined);
          setStyles(undefined);
        }, dropDuration);
      } else {
        setDragEntity(undefined);
        setStyles(undefined);
      }
    };

    dndManager.dragManager.emitter.on("dragStart", dragStart);
    dndManager.dragManager.emitter.on("dragMove", dragMove);
    dndManager.dragManager.emitter.on("dragEnd", dragEnd);

    return () => {
      dndManager.dragManager.emitter.off("dragStart", dragStart);
      dndManager.dragManager.emitter.off("dragMove", dragMove);
      dndManager.dragManager.emitter.off("dragEnd", dragEnd);
    };
  }, [dndManager]);

  if (!dragEntity || !styles) {
    return null;
  }

  return createPortal(
    children(dragEntity, styles),
    dragEntity.getData().win.document.body
  );
}

function getDragOverlayStyles(
  position: Coordinates,
  origin: Coordinates,
  originHitbox: Hitbox,
  margin: Hitbox,
  transition?: string,
  transform?: string
): CSSProperties {
  const adjustedHitbox = [
    originHitbox[0] - margin[0],
    originHitbox[1] - margin[1],
    originHitbox[2] + margin[2],
    originHitbox[3] + margin[3],
  ];

  return {
    transform:
      transform ||
      `translate3d(${position.x - origin.x + adjustedHitbox[0]}px, ${
        position.y - origin.y + adjustedHitbox[1]
      }px, 0px)`,
    width: `${adjustedHitbox[2] - adjustedHitbox[0]}px`,
    height: `${adjustedHitbox[3] - adjustedHitbox[1]}px`,
    transition,
  };
}

export function getDropDuration({
  position,
  destination,
  isCancel,
}: {
  position: Coordinates;
  destination: Coordinates;
  isCancel?: boolean;
}): number {
  const distance: number = distanceBetween(position, destination);
  // even if there is no distance to travel, we might still need to animate opacity
  if (distance <= 0) {
    return TIMINGS.minDropTime;
  }

  if (distance >= MAX_DROP_TIME_AT_DISTANCE) {
    return TIMINGS.maxDropTime;
  }

  // * range from:
  // 0px = 0.33s
  // 1500px and over = 0.55s
  // * If reason === 'CANCEL' then speeding up the animation
  // * round to 2 decimal points

  const percentage: number = distance / MAX_DROP_TIME_AT_DISTANCE;
  const duration: number = TIMINGS.minDropTime + DROP_TIME_RANGE * percentage;

  const withDuration: number = isCancel
    ? duration * CANCEL_DROP_MODIFIER
    : duration;

  return Math.round(withDuration);
}
