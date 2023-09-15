import { generateInstanceId } from "architecture/share";
import { PropsWithChildren, useEffect, useMemo } from "react";
import { ScopeProps } from "./model/archDnDModel";

export function DndScope(props: PropsWithChildren<ScopeProps>) {
  const { id, children } = props;
  const scopeId = useMemo(() => id || generateInstanceId(), [id]);

  useEffect(() => {
    // Add scope to zustand
    return () => {
      // TODO: remove scope from zustand
    };
  }, [id]);

  return children;
}
