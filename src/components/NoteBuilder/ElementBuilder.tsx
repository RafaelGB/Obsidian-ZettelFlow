import React from "react";
import { ElementBuilderProps } from "./model/NoteBuilderModel";
import { ElementSelector } from "./ElementSelector";

export function ElementBuilder(info: ElementBuilderProps) {
  const { childen } = info;
  const childrenArray = Object.entries(childen);
  if (childrenArray.length === 1) {
    // TODO: action sections with interactive elements
    return <div key={"elementBuilderTest"}>pruebas con solo 1</div>;
  }
  // TODO: selector
  return <ElementSelector {...info} />;
}
