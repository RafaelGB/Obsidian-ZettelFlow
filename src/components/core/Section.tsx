import React from "react";
import { SectionType } from "./model/SectionModel";
import { c } from "architecture";

export function Section(sectionType: SectionType) {
    const { element} = sectionType;
    return (
        <div className={c("section")}>
            {element}
        </div>
    );
}