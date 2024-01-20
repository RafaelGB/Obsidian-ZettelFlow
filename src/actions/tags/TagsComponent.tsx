import { ObsidianApi, c } from "architecture";
import { SelectableSearch } from "architecture/components/core";
import { t } from "architecture/lang";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useMemo, useState } from "react";

export function TagsWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const tagsMemo = useMemo(() => {
    const recordTags = ObsidianApi.metadataCache().getTags();
    // Sort record by entry value (number type)
    const orderedTags = Object.entries(recordTags)
      .sort((a, b) => {
        return b[1] - a[1];
      })
      .map((tag) => tag[0].substring(1));
    return orderedTags;
  }, []);

  return (
    <div className={c("tags")}>
      <SelectableSearch
        options={tagsMemo}
        initialSelections={selectedTags}
        onChange={(tags) => {
          setSelectedTags(tags);
        }}
        enableCreate={true}
        autoFocus
      />
      <button
        onClick={() => {
          callback(selectedTags);
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
