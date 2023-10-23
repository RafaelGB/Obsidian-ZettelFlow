import { WrappedActionBuilderProps } from "components/noteBuilder";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BacklinkElement } from "./model/BackLinkTypes";
import {
  FileService,
  FrontmatterService,
  MarkdownService,
} from "architecture/plugin";
import { App, Component, HeadingCache } from "obsidian";
import { ObsidianApi, c } from "architecture";
import { Input, Search } from "architecture/components/core";
import { t } from "architecture/lang";

export function BacklinkWrapper(props: WrappedActionBuilderProps) {
  const { defaultFile } = props.action.element as BacklinkElement;
  if (defaultFile) {
    return <PreviewMessage {...props} />;
  }
  return <Backlink {...props} />;
}

function Backlink(props: WrappedActionBuilderProps) {
  const { callback, plugin } = props;
  // Refs
  const previewRef = useRef<HTMLDivElement>(null);
  // States
  const [finalFileValue, setFinalFileValue] = useState<string | null>("");
  const [finalHeadingValue, setFinalHeadingValue] =
    useState<HeadingCache | null>();
  const [finalRegexValue, setFinalRegexValue] =
    useState<string>("{{wikilink}}");

  const [enableHeading, setEnableHeading] = useState<boolean>(false);
  const [headingMemo, setHeadingMemo] = useState<Record<string, HeadingCache>>(
    {}
  );
  // Memo
  const fileMemo = useMemo(() => {
    return ObsidianApi.vault()
      .getMarkdownFiles()
      .reduce((acc: Record<string, string>, file) => {
        acc[file.basename] = file.path;
        return acc;
      }, {});
  }, []);

  // Effects
  useEffect(() => {
    if (!previewRef.current || !finalFileValue || !finalHeadingValue) {
      return;
    }

    const basenameWithExtension = finalFileValue.split("/").pop();
    if (!basenameWithExtension) {
      return;
    }
    // Remove extension
    const basename = basenameWithExtension.substring(
      0,
      basenameWithExtension.lastIndexOf(".")
    );

    const comp = buildPreviewMd(
      plugin.app,
      previewRef.current,
      basename,
      finalHeadingValue,
      finalRegexValue
    );
    comp.load();
    return () => {
      comp.unload();
    };
  }, [finalFileValue, finalHeadingValue, finalRegexValue]);
  // Functions
  const obtainHeadersOfFinalFile = async (pathToSearch: string | null) => {
    if (pathToSearch) {
      const file = await FileService.getFile(pathToSearch);
      if (!file) {
        return {};
      }
      const headings = FrontmatterService.instance(file).get().headings;
      if (!headings) {
        return {};
      }
      return headings.reduce((acc: Record<string, HeadingCache>, heading) => {
        acc[heading.heading] = heading;
        return acc;
      }, {});
    } else {
      return {};
    }
  };
  // Render
  return (
    <div className={c("backlink")}>
      <div className={c("backlink-left")}>
        <Search
          options={fileMemo}
          onChange={async (value) => {
            setFinalFileValue(value);
            setEnableHeading(value !== "");
            const availableHeaders = await obtainHeadersOfFinalFile(value);
            setHeadingMemo(availableHeaders);
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
              regex: finalRegexValue,
            });
          }}
        >
          {t("component_confirm")}
        </button>
      </div>
      <div className={c("backlink-right")}>
        <Input
          value={finalRegexValue}
          placeholder="Regex"
          onChange={(value) => {
            setFinalRegexValue(value);
          }}
        />
        <div className={c("preview")} ref={previewRef} />
      </div>
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

  const { defaultFile, defaultHeading, insertPattern } =
    action.element as BacklinkElement;
  const mdRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mdRef.current || !defaultFile || !defaultHeading) {
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

    const comp = buildPreviewMd(
      plugin.app,
      mdRef.current,
      basename,
      defaultHeading,
      insertPattern
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

function buildPreviewMd(
  app: App,
  htmlElement: HTMLElement,
  basename: string,
  heading: HeadingCache,
  regex: string
): Component {
  const mdLink = `\n${regex.replace(
    "{{wikilink}}",
    `[[name of your note]]`
  )}\n`;
  const content = `**${basename}**\n${"#".repeat(heading.level)} ${
    heading.heading
  }\n${mdLink}`;
  const comp = new Component();
  MarkdownService.render(app, content, htmlElement, "/", comp);
  return comp;
}
