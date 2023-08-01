import React from "react";
import { HeaderType } from "./model/HeaderModel";
import { c } from "architecture";

export function Header(headerType:HeaderType){
    const { title, lastSection, nextSection } = headerType;
    return (
        <div className={c("header")}>
            <button
            placeholder={lastSection}
            disabled={lastSection === undefined}
            >
            {"<"}
            </button>
            <p>
            {title}
            </p>
            <button
            placeholder={nextSection}
            disabled={nextSection === undefined}
            >
            {">"}
            </button>
        </div>
    );
}