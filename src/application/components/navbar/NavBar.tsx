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
  const creationMode = useNoteBuilderStore((store) => store.creationMode);
  const title = useNoteBuilderStore((store) => store.title);
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
      {creationMode ? (
        <Input
          placeholder={t("note_title_placeholder")}
          onChange={(value) => {
            actions.setTitle(value);
            actions.setInvalidTitle(false);
          }}
          className={invalidTitle ? ["invalid"] : []}
          required={true}
        />
      ) : (
        <h5>{title}</h5>
      )}
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
        <Badge content={savedPaths.size}>
          <Icon name={RibbonIcon.TEMPLATE} />
        </Badge>
        <Badge content={savedElements.size}>
          <Icon name={RibbonIcon.ACTION} />
        </Badge>
      </div>
    </div>
  );
}
