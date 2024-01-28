import React, { useEffect, useMemo, useState } from "react";
import { NoteBuilderType } from "./typing";
import { callbackRootBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import {
  OptionType,
  Select,
  SelectMapper,
} from "application/components/select";

export function RootSelector(info: NoteBuilderType) {
  const { flow } = info;

  const actions = useNoteBuilderStore((state) => state.actions);
  const data = useNoteBuilderStore((state) => state.data);

  const [options, setOptions] = useState<OptionType[]>([]);
  useEffect(() => {
    flow.rootNodes().then((rootNodes) => {
      const rootNodesOptions = SelectMapper.flowNodes2Options(rootNodes);
      setOptions(rootNodesOptions);
    });
  }, []);

  const callbackMemo = useMemo(
    () =>
      callbackRootBuilder(
        {
          actions,
          data,
        },
        info
      ),
    []
  );
  return (
    <Select
      key={`selector-root-${options.length}`}
      options={options}
      callback={(selected) => callbackMemo(selected)}
      autofocus={true}
    />
  );
}
