import React, { useEffect, useMemo, useState } from "react";
import { NoteBuilderType } from "./typing";
import { callbackRootBuilder } from "./callbacks/CallbackNote";
import { useNoteBuilderStore } from "./state/NoteBuilderState";
import {
  OptionType,
  Select,
  SelectMapper,
} from "application/components/select";
import { c } from "architecture";
import { t } from "architecture/lang";
import { log } from "architecture";

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
    return (
      <div className={c("root-selector-status")}>
        <p>{t("root_selector_loading")}</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className={c("root-selector-status", "root-selector-status--error")}>
        <p>{t("root_selector_error")}</p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className={c("root-selector-status")}>
        <p>{t("root_selector_no_steps")}</p>
      </div>
    );
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
