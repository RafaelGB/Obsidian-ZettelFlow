import { c, log, ObsidianApi } from "architecture";
import { withScriptRun } from "architecture/api/lib/recordScriptRun";
import { SelectableSearch } from "architecture/components/core";
import { t } from "architecture/lang";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useEffect, useState } from "react";
import { DynamicSelectorElement } from "zettelkasten/typing";
import { Icon } from "architecture/components/icon";
import {
  buildAsyncScriptFunction,
  fnsManager,
  DYNAMIC_SELECTOR_BINDINGS,
  bindingNames,
  bindingArgs,
} from "architecture/api";
import { isStringTupleArray } from "../typing";

export function DynamicMultipleSelector(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const element = action as DynamicSelectorElement;
  const { code } = element;
  const [availableOptions, setAvailableOptions] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setAvailableOptions([]);
      setSelectedOptions([]);
      setLoading(false);
      return;
    }

    const fnBody = `return (async () => {
          ${code}
        })();`;

    let isMounted = true;

    const fetchOptions = async () => {
      try {
        // Both selector modes share one binding contract, so a script written for one runs in the other.
        const scriptFn = buildAsyncScriptFunction(
          bindingNames(DYNAMIC_SELECTOR_BINDINGS),
          fnBody
        );
        const args = bindingArgs(DYNAMIC_SELECTOR_BINDINGS, {
          zf: await fnsManager.getFns(),
          app: ObsidianApi.globalApp(),
        });
        // Recorded like any other run (#444).
        const result = await withScriptRun(
          {
            surface: "selector",
            origin: { ref: element.id, label: element.description ?? element.type },
          },
          () => scriptFn(...args)
        );
        if (isStringTupleArray(result)) {
          const dynamicOptions: string[] = result.map(([key]) => key);
          if (isMounted) {
            setAvailableOptions(dynamicOptions);
            setSelectedOptions([]);
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

    void fetchOptions();

    return () => {
      isMounted = false;
    };
  }, [code, element]);

  if (loading) {
    return (
      <div className={c("loading")}>
        <Icon name="spinner" className={c("loading-icon")} />
        {t("dynamic_selector_loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className={c("error")}>
        <Icon name="error" className={c("error-icon")} />
        {error}
      </div>
    );
  }

  return (
    <div className={c("tags")}>
      <SelectableSearch
        options={availableOptions}
        initialSelections={selectedOptions}
        onChange={(tags) => {
          setSelectedOptions(tags);
        }}
        enableCreate={true}
        autoFocus
      />
      <button
        className={c("confirm-button")}
        onClick={() => {
          callback(selectedOptions);
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
