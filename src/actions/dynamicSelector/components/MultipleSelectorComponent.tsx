import { c } from "architecture";
import { SelectableSearch } from "architecture/components/core";
import { t } from "architecture/lang";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useEffect, useState } from "react";
import { DynamicSelectorElement } from "zettelkasten/typing";

export function DynamicMultipleSelector(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const element = action as DynamicSelectorElement;
  const { code } = element;
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Evitar ejecutar si no hay código dinámico
    if (!code) {
      setSelectedOptions([]);
      setLoading(false);
      return;
    }

    const AsyncFunction = Object.getPrototypeOf(
      async function () {}
    ).constructor;

    const fnBody = `return (async () => {
          ${code}
        })(element);`;

    let isMounted = true; // Para evitar actualizaciones de estado en componentes desmontados

    try {
      const scriptFn = new AsyncFunction("element", fnBody);

      const fetchOptions = async () => {
        try {
          const result = await scriptFn(element);
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
            const dynamicOptions: string[] = result.map(
              ([key]: [string, string]) => key
            );
            if (isMounted) {
              setSelectedOptions(dynamicOptions);
              setError(null);
            }
          } else {
            throw new Error("El formato de las opciones es inválido.");
          }
        } catch (err) {
          console.error("Error al obtener las opciones dinámicas:", err);
          if (isMounted) {
            setError("No se pudieron cargar las opciones.");
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      };

      fetchOptions();
    } catch (err) {
      console.error("Error al inicializar la función dinámica:", err);
      setError("Error de inicialización.");
      setLoading(false);
    }

    return () => {
      isMounted = false; // Cleanup after unmount
    };
  }, [code, element]);

  if (loading) {
    return <div>Loading options...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className={c("tags")}>
      <SelectableSearch
        options={selectedOptions}
        onChange={(tags) => {
          setSelectedOptions(tags);
        }}
        enableCreate={true}
        autoFocus
      />
      <button
        onClick={() => {
          callback(selectedOptions);
        }}
      >
        {t("component_confirm")}
      </button>
    </div>
  );
}
