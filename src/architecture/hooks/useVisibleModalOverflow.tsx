import { c } from "architecture/styles/helper";
import { useEffect } from "react";

export function useVisibleModalOverflow() {
  useEffect(() => {
    const modal = document.querySelector(".modal");
    if (modal) {
      modal.classList.add(c("visible-overflow"));
    }
    return () => {
      if (modal) {
        modal.classList.remove(c("visible-overflow"));
      }
    };
  }, []);
}
