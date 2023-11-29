import { t } from "architecture/lang";
import React from "react";

import {
  NoteBuilderType,
  callbackBuildActualState,
  callbackSkipNote,
  useNoteBuilderStore,
} from "application/components/noteBuilder";
import { c } from "architecture";
import { Badge, Input } from "architecture/components/core";
import { Icon } from "architecture/components/icon";
import { RibbonIcon } from "starters/zcomponents/RibbonIcon";

export function NavBar(props: NoteBuilderType) {
  const actions = useNoteBuilderStore((store) => store.actions);
  const data = useNoteBuilderStore((store) => store.data);
  const invalidTitle = useNoteBuilderStore((store) => store.invalidTitle);
  const enableSkip = useNoteBuilderStore((store) => store.enableSkip);
  const [savedPaths, savedElements] = useNoteBuilderStore((store) => [
    store.builder.note.getPaths(),
    store.builder.note.getElements(),
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
      <div className={c("navbar_button_group")}>
        {enableSkip && (
          <button
            className={c("navbar_skip_button")}
            onClick={callbackSkipNote({ actions, data }, props)}
            title={t("navbar_skip_step")}
          >
            <Icon name="cross-in-box" />
          </button>
        )}
        {savedPaths.size + savedElements.size > 0 && (
          <button
            className={c("navbar_build_button")}
            onClick={callbackBuildActualState({ actions, data }, props)}
            title={t("navbar_abort_flow")}
          >
            <Icon name="create-new" />
          </button>
        )}
      </div>
      <div className={c("navbar_icons")}>
        <Badge
          content={savedPaths.size}
          children={<Icon name={RibbonIcon.TEMPLATE} />}
        />
        <Badge
          content={savedElements.size}
          children={<Icon name={RibbonIcon.ACTION} />}
        />
      </div>
    </div>
  );
}
