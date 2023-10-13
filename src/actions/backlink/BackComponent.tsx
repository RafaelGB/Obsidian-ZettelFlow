import { WrappedActionBuilderProps } from "components/NoteBuilder";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BacklinkElement } from "./model/BackLinkTypes";
import { MarkdownService } from "architecture/plugin";
import { Component } from "obsidian";
import { ObsidianApi, c } from "architecture";
import { useOnClickAway } from "hooks";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [filteredFiles, setFilteredFiles] = useState<string[]>(fileMemo);
  const [visibleFileOptions, setVisibleFileOptions] = useState<boolean>(false);
  useOnClickAway(fileRef, () => {
    setVisibleFileOptions(false);
  });

  const headingMemo = useMemo(() => {
    return ["heading1", "heading2", "heading3"];
  }, [file]);
  const headingRef = useRef<HTMLInputElement>(null);
  useOnClickAway(headingRef, () => {
    setVisibleHeadingOptions(false);
  });
  const [heading, setHeading] = useState<string>("");
  const [selectedHeading, setSelectedHeading] = useState<string>("");
  const [filteredHeadings, setFilteredHeadings] =
    useState<string[]>(headingMemo);
  const [visibleHeadingOptions, setVisibleHeadingOptions] =
    useState<boolean>(false);

  return (
    <div className={c("backlink")}>
      <div ref={fileRef}>
        <input
          type="search"
          value={file}
          onChange={(e) => {
            setFile(e.target.value);
            setFilteredFiles(
              fileMemo.filter((f) =>
                f.toLowerCase().includes(e.target.value.toLowerCase())
              )
            );
          }}
          onFocus={() => {
            setVisibleFileOptions(true);
          }}
          placeholder="Search for a note"
        />
        {visibleFileOptions && (
          <ul>
            {filteredFiles.map((f) => (
              <li
                onClick={() => {
                  setFile(f);
                  setSelectedFile(f);
                }}
                key={`file-${f}`}
              >
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
      {file && (
        <div ref={headingRef}>
          <input
            type="search"
            value={heading}
            onChange={(e) => {
              setHeading(e.target.value);
              setFilteredHeadings(
                headingMemo.filter((f) =>
                  f.toLowerCase().includes(e.target.value.toLowerCase())
                )
              );
            }}
            onFocus={() => {
              setVisibleHeadingOptions(true);
            }}
            placeholder="Search for a heading"
          />
          {visibleHeadingOptions && (
            <ul>
              {filteredHeadings.map((f) => (
                <li
                  onClick={() => {
                    setHeading(f);
                    setSelectedHeading(file);
                  }}
                  key={`heading-${f}`}
                >
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button
        onClick={() => {
          callback({
            file: selectedFile,
            heading: selectedHeading,
          });
        }}
      >
        confirm
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
