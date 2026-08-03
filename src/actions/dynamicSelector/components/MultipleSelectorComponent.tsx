import { c } from "architecture";
import { SelectableSearch } from "architecture/components/core";
import { t } from "architecture/lang";
import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useEffect, useState } from "react";
import { DynamicSelectorElement } from "zettelkasten/typing";
import { Icon } from "architecture/components/icon";
import { buildAsyncScriptFunction } from "architecture/api";
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
        })(element);`;

    let isMounted = true;

    try {
      const scriptFn = buildAsyncScriptFunction(["element"], fnBody);

      const fetchOptions = async () => {
        try {
          const result = await scriptFn(element);
          if (isStringTupleArray(result)) {
            const dynamicOptions: string[] = result.map(
              ([key]) => key
            );
            if (isMounted) {
              setAvailableOptions(dynamicOptions);
              setSelectedOptions([]); // Inicialmente no hay selecciones
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

      void fetchOptions();
    } catch (err) {
      console.error("Error al inicializar la función dinámica:", err);
      setError("Error de inicialización.");
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [code, element]);

  if (loading) {
    return (
      <div className={c("loading")}>
        <Icon name="spinner" className={c("loading-icon")} />
        Cargando opciones...
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
