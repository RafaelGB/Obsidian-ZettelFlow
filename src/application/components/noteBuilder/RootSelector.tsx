import React, { useEffect, useMemo, useState } from "react";
import { NoteBuilderType } from "./typing";
import { callbackRootBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import {
  OptionType,
  Select,
  SelectMapper,
} from "application/components/select";
import { t } from "architecture/lang";
import { log } from "architecture";
import { WizardState } from "./WizardState";

type LoadState = "loading" | "ready" | "error";

export function RootSelector(info: NoteBuilderType) {
  const { flow } = info;

  const actions = useNoteBuilderStore((state) => state.actions);
  const data = useNoteBuilderStore((state) => state.data);

  const [options, setOptions] = useState<OptionType[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    flow
      .rootNodes()
      .then((rootNodes) => {
        setOptions(SelectMapper.flowNodes2Options(rootNodes));
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        log.error(`RootSelector: failed to load root nodes — ${String(err)}`);
        setLoadState("error");
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

  if (loadState === "loading") {
    return <WizardState kind="loading" message={t("root_selector_loading")} />;
  }

  if (loadState === "error") {
    return <WizardState kind="error" message={t("root_selector_error")} />;
  }

  if (options.length === 0) {
    return <WizardState kind="empty" message={t("root_selector_no_steps")} />;
  }

  return (
    <Select
      key={`selector-root-${options.length}`}
      options={options}
      callback={(selected) => callbackMemo(selected)}
      autofocus={true}
    />
  );
}
