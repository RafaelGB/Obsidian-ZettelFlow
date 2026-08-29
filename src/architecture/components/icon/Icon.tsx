import { c } from "architecture/styles/helper";
import { setIcon } from "obsidian";
import React, { useEffect, useRef } from "react";
import { IconProps } from "./model/IconModel";

/**
 * Renders an Obsidian icon into a span. `setIcon` is invoked from an effect keyed on `name` — **not** an
 * inline `ref` — so it runs once on mount and only again when the icon changes. An inline ref re-fires on
 * every parent re-render, re-running `setIcon` into a node that already holds the icon, which can throw
 * Obsidian's "appendChild: only one element on node is allowed" and unmount the surrounding React tree
 * (#327). The span is emptied before each set so it never accumulates duplicate glyphs.
 */
export function Icon({ name, className }: IconProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.empty();
    setIcon(el, name);
  }, [name]);

  return <span data-icon={name} className={`${c("icon")} ${className || ""}`} ref={ref} />;
}
