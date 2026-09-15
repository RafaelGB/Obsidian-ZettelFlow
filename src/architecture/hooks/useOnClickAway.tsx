import { RefObject, useEffect } from "react";

export function useOnClickAway(
  // Nullable on purpose (#418): a ref attaches on mount, and the guard below already expects that.
  ref: RefObject<HTMLElement | null>,
  handler: () => void
) {
  useEffect(() => {
    const handleOutSideClick = (event: MouseEvent) => {
      if (event.target) {
        if (ref.current && !ref.current.contains(event.target as Node)) {
          handler();
        }
      }
    };

    window.addEventListener("mousedown", handleOutSideClick);

    return () => {
      window.removeEventListener("mousedown", handleOutSideClick);
    };
  }, [ref, handler]);
}
