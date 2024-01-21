import { ObsidianApi, c } from "architecture";
import { SelectableSearch } from "architecture/components/core";
import { t } from "architecture/lang";
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
      <button
        onClick={() => {
          callback(selectedCssClasses);
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
