import { t } from "architecture/lang";
import React from "react";
import { Input } from "./Input";
import { useNoteBuilderStore } from "components/NoteBuilder";
import { c } from "architecture";
import { Badge } from "@material-tailwind/react";
import { ActionIcon, TemplateIcon } from "components/icons";

export function NavBar() {
  const actions = useNoteBuilderStore((store) => store.actions);
  const invalidTitle = useNoteBuilderStore((store) => store.invalidTitle);
  const [iconIsHovered, setIconIsHovered] = React.useState(false);
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
      <div className={c("navbar_icons")} onMouseOver={(e) => {}}>
        <Badge content={savedPaths.size} children={<TemplateIcon />} />
        <Badge content={savedElements.size} children={<ActionIcon />} />
        {/** Display the name of the saved files until now */}
        {iconIsHovered && (
          <p>
            {Object.values(savedPaths).reduce(
              (acc, path) => acc + " " + path,
              ""
            )}
          </p>
        )}
      </div>
    </div>
  );
}
