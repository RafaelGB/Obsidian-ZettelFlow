import { RefObject, useEffect } from "react";

export function useScrollToSelected(
  ref: RefObject<HTMLElement>,
  selectedIndex: number | null
) {
  useEffect(() => {
    if (ref.current && selectedIndex != null) {
      const listItem = ref.current.children[selectedIndex];
      if (listItem) {
        const listRect = ref.current.getBoundingClientRect();
        const itemRect = listItem.getBoundingClientRect();
        if (itemRect.bottom > listRect.bottom) {
          ref.current.scrollTop += itemRect.bottom - listRect.bottom;
        } else if (itemRect.top < listRect.top) {
          ref.current.scrollTop += itemRect.top - listRect.top;
        }
      }
    }
  }, [selectedIndex]); // Escucha los cambios en listRef y objects
}
