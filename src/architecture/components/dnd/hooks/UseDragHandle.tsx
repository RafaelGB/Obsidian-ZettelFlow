import { RefObject, useEffect } from "react";
import { useDnDManager } from "../state/DnDState";

export function useDragHandle(
  managerId: string,
  droppableElement: RefObject<HTMLDivElement | null>,
  handleElement: RefObject<HTMLDivElement | null>,
  index: number
) {
  const manager = useDnDManager((state) => state.getScope(managerId));
  useEffect(() => {
    if (!manager) {
      return;
    }
    const droppable = droppableElement.current;
    const handle = handleElement.current;

    if (!droppable || !handle) {
      return;
    }
    const onPointerDown = async (e: PointerEvent) => {
      if (!isPointerEventValid(e)) {
        return;
      }
      await manager.dragStart(e, droppable);
    };

    manager.registerDroppable(droppable, index);
    const swallowTouchEvent = (e: TouchEvent) => {
      e.stopPropagation();
    };
    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("touchstart", swallowTouchEvent);
    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("touchstart", swallowTouchEvent);
    };
  }, [droppableElement, handleElement, manager]);
}

function isPointerEventValid(e: PointerEvent) {
  if (e.defaultPrevented || (e.target as HTMLElement).dataset.ignoreDrag) {
    return false;
  }
  // We only care about left mouse / touch contact
  // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events#determining_button_states
  if (e.button !== 0 && e.buttons !== 1) {
    return false;
  }

  return true;
}
