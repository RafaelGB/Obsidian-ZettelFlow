/** Line / Area panel (pure). `area` toggles the fill. Epic #622, S4 #626. */
import type { EChartsOption } from "echarts";
import type { DataStoreSnapshot } from "dashboards/datastore";
import type { ChartTheme } from "../theme";
import type { PanelConfig } from "../types";

export function buildLineOption(
    snapshot: DataStoreSnapshot,
    config: PanelConfig,
    theme: ChartTheme,
    area: boolean,
): EChartsOption {
    const categoryField = config.mapping.category;
    const seriesFields = config.mapping.series ?? [];
    const categories = categoryField
        ? snapshot.rows.map((row) => row[categoryField]?.display ?? "")
        : [];

    const series = seriesFields.map((field, index) => {
        const color = theme.palette[index % theme.palette.length];
        return {
            type: "line" as const,
            name: snapshot.schema.byId[field]?.name ?? field,
            showSymbol: false,
            areaStyle: area ? {} : undefined,
            lineStyle: { color },
            itemStyle: { color },
            data: snapshot.rows.map((row) => {
                const cell = row[field];
                return cell && typeof cell.raw === "number" ? cell.raw : null;
            }),
        };
    });

    return {
        backgroundColor: "transparent",
        textStyle: { color: theme.text },
        grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
        tooltip: { trigger: "axis" },
        legend: seriesFields.length > 1 ? { textStyle: { color: theme.axis } } : undefined,
        xAxis: {
            type: "category",
            boundaryGap: false,
            data: categories,
            axisLine: { lineStyle: { color: theme.split } },
            axisLabel: { color: theme.axis },
        },
        yAxis: {
            type: "value",
            splitLine: { lineStyle: { color: theme.split } },
            axisLabel: { color: theme.axis },
        },
        series,
    };
}
