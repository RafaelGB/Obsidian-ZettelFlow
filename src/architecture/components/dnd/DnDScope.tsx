import { PropsWithChildren, useEffect } from "react";
import { useDnDManager } from "./state/DnDState";
import { ScopeProps } from "./model/DnDScopeModel";

export function DndScope(props: PropsWithChildren<ScopeProps>) {
  const { id, manager, children } = props;
  /**
   * STATE
   */
  const scopeActions = useDnDManager((state) => state.scopeActions);
  /**
   * EFFECTS
   */
  useEffect(() => {
    // Add scope to zustand
    scopeActions.addScope(id, manager);
    return () => {
      // Remove scope from zustand
      scopeActions.removeScope(id);
    };
  }, [id]);

  return children;
}
