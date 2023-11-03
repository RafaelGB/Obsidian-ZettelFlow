import { SelectableSearch } from "architecture/components/core";
import { WrappedActionBuilderProps } from "components/noteBuilder";
import React, { useMemo } from "react";

export function TagsWrapper(props: WrappedActionBuilderProps) {
  const { callback } = props;
  const tagsMemo = useMemo(() => {
    return ["tag1", "tag2", "tag3"];
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
