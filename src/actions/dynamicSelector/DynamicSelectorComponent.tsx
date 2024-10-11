import { WrappedActionBuilderProps } from "application/components/noteBuilder";
import React, { useEffect, useState } from "react";
import { OptionType, Select } from "application/components/select";
import { DynamicSelectorElement } from "zettelkasten/typing";

export function DynamicSelectorWrapper(props: WrappedActionBuilderProps) {
  const { callback, action } = props;
  const element = action as DynamicSelectorElement;
  const { code } = element;

  const [options, setOptions] = useState<OptionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Evitar ejecutar si no hay código dinámico
    if (!code) {
      setOptions([]);
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
      isMounted = false; // Limpieza para evitar actualizaciones después del desmontaje
    };
  }, [code, element]);

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
