import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useEffect, useMemo, useState } from "react";
import { OptionType, Select } from "application/components/select";
import { DynamicSelectorElement } from "zettelkasten/typing";
import { fnsManager } from "architecture/api";

export function DynamicSelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const element = action as DynamicSelectorElement;
  const { code } = element;

  const [options, setOptions] = useState<OptionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const resultMemo = useMemo(async () => {
    const functions = await fnsManager.getFns();
    const fnBody = `return (async () => {
          ${code}
        })(zf);`;
    const AsyncFunction = Object.getPrototypeOf(
      async function () {}
    ).constructor;
    const scriptFn = new AsyncFunction("zf", fnBody);

    return await scriptFn(functions);
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

        // Validar que result sea un arreglo de tuplas [string, string]
        if (
          Array.isArray(result) &&
          result.every(
            (item) =>
              Array.isArray(item) &&
              item.length === 2 &&
              typeof item[0] === "string" &&
              typeof item[1] === "string"
          )
        ) {
          const dynamicOptions: OptionType[] = result.map(
            ([key, label]: [string, string]) => ({
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
          throw new Error("The script must return an array of tuples.");
        }
      } catch (err) {
        console.error("Error obtaining dynamic options", err);
        if (isMounted) {
          setError(
            "There was an error obtaining the dynamic options. Please check the script / console for more information."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false; // Cleanup after unmount
    };
  }, []); // Arreglo de dependencias vacío para ejecutar solo una vez

  if (loading) {
    return <div>Loading options...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
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
