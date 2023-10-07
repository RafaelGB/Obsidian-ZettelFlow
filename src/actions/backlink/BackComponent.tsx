import { WrappedActionBuilderProps } from "components/NoteBuilder";
import React, { useEffect, useRef } from "react";
import { BacklinkElement } from "./model/BackLinkTypes";
import { MarkdownService } from "architecture/plugin";
import { Component } from "obsidian";

export function BacklinkWrapper(props: WrappedActionBuilderProps) {
  const { defaultFile } = props.action.element as BacklinkElement;
  if (defaultFile) {
    return <PreviewMessage {...props} />;
  }
  return <div>Dynamic backlink not supported yet</div>;
}

/**
 * Advise user that default file will be used but can be skipped
 * @param props
 * @returns
 */
function PreviewMessage(props: WrappedActionBuilderProps) {
  const { action, plugin } = props;

  const { defaultFile, defaultHeading } = action.element as BacklinkElement;
  const mdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mdRef.current || !defaultFile) {
      return;
    }
    const basenameWithExtension = defaultFile.split("/").pop();
    if (!basenameWithExtension) {
      return;
    }
    // Remove extension
    const basename = basenameWithExtension.substring(
      0,
      basenameWithExtension.lastIndexOf(".")
    );

    const comp = new Component();
    MarkdownService.render(
      plugin.app,
      `Accepts to insert backlink on [[${basename}#${defaultHeading?.heading}]]`,
      mdRef.current,
      "/",
      comp
    );
    comp.load();
    return () => {
      comp.unload();
    };
  }, []);
  return (
    <>
      <div ref={mdRef} />
      <button
        onClick={() => {
          props.callback(true);
        }}
      >
        Continue
      </button>
    </>
  );
}
