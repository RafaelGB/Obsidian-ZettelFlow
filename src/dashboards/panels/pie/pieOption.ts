/** Pie / Donut panel (pure). `donut` opens the centre. Epic #622, S4 #626. */
import type { EChartsOption } from "echarts";
import type { DataStoreSnapshot } from "dashboards/datastore";
import type { ChartTheme } from "../theme";
import type { PanelConfig } from "../types";

export function buildPieOption(
    snapshot: DataStoreSnapshot,
    config: PanelConfig,
    theme: ChartTheme,
    donut: boolean,
): EChartsOption {
    const nameField = config.mapping.category;
    const valueField = config.mapping.value;
    const data =
        nameField && valueField
            ? snapshot.rows.map((row) => {
                  const valueCell = row[valueField];
                  return {
                      name: row[nameField]?.display ?? "",
                      value: valueCell && typeof valueCell.raw === "number" ? valueCell.raw : 0,
                  };
              })
            : [];

    return {
        backgroundColor: "transparent",
        textStyle: { color: theme.text },
        tooltip: { trigger: "item" },
        legend: { textStyle: { color: theme.axis } },
        color: theme.palette,
        series: [{ type: "pie", radius: donut ? ["40%", "70%"] : "70%", data }],
    };
}
