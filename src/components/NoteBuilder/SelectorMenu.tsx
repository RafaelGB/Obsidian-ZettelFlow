import React, { StrictMode, useState } from "react";
import { NoteBuilderType } from "./model/NoteBuilderModel";
import { Select,Header,Section, HeaderType, SectionType } from "components/core";
import { log } from "architecture";

export function buildSelectorMenu(noteBuilderType: NoteBuilderType){
    return <NoteBuilder {...noteBuilderType} />;
}

function NoteBuilder(noteBuilderType: NoteBuilderType){
    return(
        <StrictMode>
            <div>
                <Component {...noteBuilderType} />
            </div>
        </StrictMode>
    );
}

function Component(noteBuilderType: NoteBuilderType){
    const { settings } = noteBuilderType.plugin;
    const [headerState,setHeader] = useState<HeaderType>({
        title: "My first header",
    });

    const [sectionState,setSection] = useState<SectionType>({
        color: "red",
        position: 1,
        element: <Select options={[{key:"opt1",label:"Opcion 1"}]} callback={(selected) => {log.info(selected)}}/>
    });

    return(
        <>
        <Header {...headerState}/>
        <Section {...sectionState}/>
        </>
    )
}