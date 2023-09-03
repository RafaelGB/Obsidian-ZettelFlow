import React, { StrictMode } from "react";
import { NoteBuilderProps, NoteBuilderType } from "./model/NoteBuilderModel";
import { Header, Section, Input } from "components/core";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import { t } from "architecture/lang";
import { Builder } from "notes";
import { FileService } from "architecture/plugin";
import { WelcomeTutorial } from "./WelcomeTutorial";

export function buildSelectorMenu(noteBuilderType: NoteBuilderType) {
  return <NoteBuilder {...noteBuilderType} />;
}

function NoteBuilder(noteBuilderType: NoteBuilderType) {
  return (
    <StrictMode>
      <div>
        <Component
          {...noteBuilderType}
          builder={Builder.init({
            targetFolder: FileService.PATH_SEPARATOR,
          })}
        />
      </div>
    </StrictMode>
  );
}

function Component(noteBuilderType: NoteBuilderProps) {
  const { plugin } = noteBuilderType;
  const { settings } = plugin;
  const actions = useNoteBuilderStore((store) => store.actions);
  const invalidTitle = useNoteBuilderStore((store) => store.invalidTitle);
  return settings.workflow?.length > 0 ? (
    <>
      <Input
        placeholder={t("note_title_placeholder")}
        onChange={(value) => {
          actions.setTitle(value);
          actions.setInvalidTitle(false);
        }}
        className={invalidTitle ? ["invalid"] : []}
        required={true}
      />
      <Header />
      <Section {...noteBuilderType} />
    </>
  ) : (
    <WelcomeTutorial {...noteBuilderType} />
  );
}
