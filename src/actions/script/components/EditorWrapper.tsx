import React, { useEffect, useState } from "react";
import { EditorWrapperProps } from "./typing";
export function EditorWrapper(props: EditorWrapperProps) {
  const { root } = props;
  useEffect(() => {
    return () => {
      root.unmount();
    };
  }, []);
  return <></>;
}
