import { ObsidianApi } from "architecture";
import { SelectableSearch } from "architecture/components/core";
import { WrappedActionBuilderProps } from "components/noteBuilder";
import React, { useMemo } from "react";

export function TagsWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;

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
    <SelectableSearch
      options={tagsMemo}
      onChange={(tags) => {
        callback(tags);
      }}
    />
  );
}
