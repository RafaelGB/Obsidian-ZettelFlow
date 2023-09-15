import { PropsWithChildren, useEffect, useMemo, useRef, useState } from "react";
import { SortableProps } from "./model/archDnDModel";
import { SortManager } from "./managers/SortManager";

export function Sortable(props: PropsWithChildren<SortableProps>) {
  const { axis, onSortChange, children } = props;
  /*const dndManager = Object;
  const sortManager = useMemo(() => {
    if (dndManager) {
      if (managerRef.current) {
        managerRef.current.destroy();
      }

      const manager = new SortManager(dndManager, axis, onSortChange);

      managerRef.current = manager;

      return manager;
    }

    return null;
  }, [dndManager, axis, onSortChange]);

  useEffect(() => {
    return () => managerRef.current?.destroy();
  }, []);

  if (!sortManager) {
    return null;
  }
*/
  return children;
}

export function useIsSorting() {
  const sortManager: any = Object;
  const [isSorting, setIsSorting] = useState(false);

  useEffect(() => {
    sortManager.addSortNotifier(setIsSorting);

    return () => {
      sortManager.removeSortNotifier(setIsSorting);
    };
  }, [sortManager]);

  return isSorting;
}
