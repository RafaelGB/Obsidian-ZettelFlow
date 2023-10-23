import { t } from "architecture/lang";
import React from "react";

import {
  NoteBuilderType,
  callbackSkipNote,
  useNoteBuilderStore,
} from "components/noteBuilder";
import { c } from "architecture";
import { ActionIcon, TemplateIcon } from "components/icons";
import { Badge, Input } from "architecture/components/core";

export function NavBar(props: NoteBuilderType) {
  const actions = useNoteBuilderStore((store) => store.actions);
  const data = useNoteBuilderStore((store) => store.data);
  const invalidTitle = useNoteBuilderStore((store) => store.invalidTitle);
  const enableSkip = useNoteBuilderStore((store) => store.enableSkip);
  const [savedPaths, savedElements] = useNoteBuilderStore((store) => [
    store.builder.info.getPaths(),
    store.builder.info.getElements(),
  ]);

  return (
    <div className={c("navbar")}>
      <Input
        placeholder={t("note_title_placeholder")}
        onChange={(value) => {
          actions.setTitle(value);
          actions.setInvalidTitle(false);
        }}
        className={invalidTitle ? ["invalid"] : []}
        required={true}
      />
      {enableSkip && (
        <button
          className={c("navbar_skip_button")}
          onClick={callbackSkipNote({ actions, data }, props)}
        >
          {t("navbar_skip_step")}
        </button>
      )}

      <div className={c("navbar_icons")}>
        <Badge content={savedPaths.size} children={<TemplateIcon />} />
        <Badge content={savedElements.size} children={<ActionIcon />} />
      </div>
    </div>
  );
}
