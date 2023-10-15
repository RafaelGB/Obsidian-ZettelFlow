import { WrappedActionBuilderProps } from "components/NoteBuilder";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BacklinkElement } from "./model/BackLinkTypes";
import { MarkdownService } from "architecture/plugin";
import { Component } from "obsidian";
import { ObsidianApi, c } from "architecture";
import { Search } from "components/core";

export function BacklinkWrapper(props: WrappedActionBuilderProps) {
  const { defaultFile } = props.action.element as BacklinkElement;
  if (defaultFile) {
    return <PreviewMessage {...props} />;
  }
  return <Backlink {...props} />;
}

function Backlink(props: WrappedActionBuilderProps) {
  const { callback } = props;
  const fileMemo = useMemo(() => {
    return ObsidianApi.vault()
      .getMarkdownFiles()
      .map((f) => f.basename);
  }, []);
  const [finalFileValue, setFinalFileValue] = useState<string>("");
  const [finalHeadingValue, setFinalHeadingValue] = useState<string>("");

  const [enableHeading, setEnableHeading] = useState<boolean>(false);

  const headingMemo = useMemo(() => {
    if (finalFileValue) {
      return [];
    } else {
      return [];
    }
  }, [finalFileValue]);

  return (
    <div className={c("backlink")}>
      <Search
        options={fileMemo}
        onChange={(value) => {
          setFinalFileValue(value);
          if (value) {
            setEnableHeading(true);
          } else {
            setEnableHeading(false);
          }
        }}
        placeholder="Select a file"
      />
      {enableHeading && (
        <Search
          options={headingMemo}
          onChange={(value) => {
            setFinalHeadingValue(value);
          }}
          placeholder="Select a heading"
        />
      )}
      <button
        onClick={() => {
          callback({
            file: finalFileValue,
            heading: finalHeadingValue,
          });
        }}
      >
        Confirm
      </button>
    </div>
  );
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
