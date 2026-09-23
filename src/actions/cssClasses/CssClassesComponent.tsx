import { ObsidianApi, c } from "architecture";
import { ConfirmStep, SelectableSearch } from "architecture/components/core";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useMemo, useState } from "react";

export function CssClassesWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  const [selectedCssClasses, setSelectedCssClasses] = useState<string[]>([]);
  const cssClassesMemo = useMemo(() => {
    // Obtain css classes from frontmatter
    return ObsidianApi.metadataCache().getFrontmatterPropertyValuesForKey(
      "cssclasses"
    );
  }, []);

  return (
    <div className={c("cssclasses")}>
      <SelectableSearch
        options={cssClassesMemo}
        initialSelections={selectedCssClasses}
        onChange={(cssclasses) => {
          setSelectedCssClasses(cssclasses);
        }}
        enableCreate={true}
        autoFocus
      />
      <ConfirmStep onConfirm={() => callback(selectedCssClasses)} />
    </div>
  );
}
