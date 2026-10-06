import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useEffect, useMemo, useState } from "react";
import { OptionType, Select } from "application/components/select";
import { DynamicSelectorElement } from "zettelkasten/typing";
import {
  fnsManager,
  buildAsyncScriptFunction,
  DYNAMIC_SELECTOR_BINDINGS,
  bindingNames,
  bindingArgs,
} from "architecture/api";
import { log, ObsidianApi } from "architecture";
import { withScriptRun } from "architecture/api/lib/recordScriptRun";
import { t } from "architecture/lang";
import { isStringTupleArray } from "./typing";
import { WizardState } from "application/components/noteBuilder/WizardState";

export function DynamicSelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const element = action as DynamicSelectorElement;
  const { code } = element;

  const [options, setOptions] = useState<OptionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const resultMemo = useMemo(async () => {
    const fnBody = `return (async () => {
          ${code}
        })();`;
    const scriptFn = buildAsyncScriptFunction(
      bindingNames(DYNAMIC_SELECTOR_BINDINGS),
      fnBody
    );

    const args = bindingArgs(DYNAMIC_SELECTOR_BINDINGS, {
      zf: await fnsManager.getFns(),
      app: ObsidianApi.globalApp(),
    });
    // Recorded like any other run (#444): a selector that throws used to leave only a red box.
    return await withScriptRun(
      { surface: "selector", origin: { ref: element.id, label: element.description ?? element.type } },
      () => scriptFn(...args)
    );
  }, []);

  useEffect(() => {
    // No state updates after the step has gone.
    let isMounted = true;

    const fetchData = async () => {
      // No script, no options: nothing to run.
      if (!code) {
        if (isMounted) {
          setOptions([]);
          setLoading(false);
        }
        return;
      }
      try {
        const result = await resultMemo;

        // Validate that result is an array of [string, string] tuples
        if (isStringTupleArray(result)) {
          const dynamicOptions: OptionType[] = result.map(
            ([key, label]) => ({
              key,
              label,
              actionTypes: [],
            })
          );
          if (isMounted) {
            setOptions(dynamicOptions);
            setError(null);
          }
        } else {
          throw new Error(t("dynamic_selector_invalid_result"));
        }
      } catch (err) {
        log.error("Error obtaining dynamic options", err);
        if (isMounted) {
          setError(t("dynamic_selector_error"));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      isMounted = false; // Cleanup after unmount
    };
    // Once per step: the script runs when the step mounts.
  }, []);

  // The wizard's one loading / error treatment (#409), not a bare line of text.
  if (loading) {
    return <WizardState kind="loading" message={t("dynamic_selector_loading")} />;
  }

  if (error) {
    return <WizardState kind="error" message={error} />;
  }

  if (options.length === 0) {
    return <WizardState kind="empty" message={t("dynamic_selector_empty")} />;
  }

  return (
    <Select
      key={`dynamic-selector-root`}
      options={options}
      callback={callback}
      autofocus={true}
    />
  );
}
