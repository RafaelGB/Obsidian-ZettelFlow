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
import { t } from "architecture/lang";
import { isStringTupleArray } from "./typing";

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

    return await scriptFn(
      ...bindingArgs(DYNAMIC_SELECTOR_BINDINGS, {
        zf: await fnsManager.getFns(),
        app: ObsidianApi.globalApp(),
      })
    );
  }, []);

  useEffect(() => {
    let isMounted = true; // Para evitar actualizaciones de estado en componentes desmontados

    const fetchData = async () => {
      // Evitar ejecutar si no hay código dinámico
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
              color: "var(--canvas-color-5)",
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
  }, []); // Arreglo de dependencias vacío para ejecutar solo una vez

  if (loading) {
    return <div>{t("dynamic_selector_loading")}</div>;
  }

  if (error) {
    return <div>{error}</div>;
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
