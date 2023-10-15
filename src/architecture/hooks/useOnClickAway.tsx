import { RefObject, useEffect } from "react";

export function useOnClickAway(
  ref: RefObject<HTMLElement>,
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
