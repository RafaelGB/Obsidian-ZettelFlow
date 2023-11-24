import React, { useEffect } from "react";
import { EditorWrapperProps } from "./typing";
export function CodeEditor(props: EditorWrapperProps) {
  const { root } = props;
  useEffect(() => {
    return () => {
      root.unmount();
    };
  }, []);
  return <></>;
}
