import { WrappedActionBuilderProps } from "components/NoteBuilder";
import React from "react";
import { BacklinkElement } from "./model/BackLinkTypes";

export function BacklinkWrapper(props: WrappedActionBuilderProps) {
  const { defaultFile, defaultHeading } = props.action
    .element as BacklinkElement;
  if (defaultFile) {
    // Advise user that default file will be used but can be skipped
    return (
      <>
        <h4>{`Accepts to insert ${defaultFile}#${defaultHeading?.heading}`}</h4>
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
  return <div>Dynamic backlink not supported yet</div>;
}
