/**
 * The Bar panel (pure): `(snapshot, config, theme) => EChartsOption`. No ECharts at runtime — the
 * type is erased — so this stays jest-testable; the DOM host feeds the option to a real chart.
 * Colours come from the theme bridge (the user's theme, §XV), never hardcoded.
 */
import type { EChartsOption } from "echarts";
import type { DataStoreSnapshot } from "dashboards/datastore";
import type { ChartTheme } from "../theme";
import type { PanelConfig } from "../types";

export function buildBarOption(
    snapshot: DataStoreSnapshot,
    config: PanelConfig,
    theme: ChartTheme,
): EChartsOption {
    const categoryField = config.mapping.category;
    const seriesFields = config.mapping.series ?? [];

    const categories = categoryField
        ? snapshot.rows.map((row) => row[categoryField]?.display ?? "")
        : [];

    const series = seriesFields.map((field, index) => ({
        type: "bar" as const,
        name: snapshot.schema.byId[field]?.name ?? field,
        itemStyle: { color: theme.palette[index % theme.palette.length] },
        data: snapshot.rows.map((row) => {
            const cell = row[field];
            return cell && typeof cell.raw === "number" ? cell.raw : null;
        }),
    }));

    return {
        backgroundColor: "transparent",
        textStyle: { color: theme.text },
        grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
        tooltip: { trigger: "axis" },
        legend: seriesFields.length > 1 ? { textStyle: { color: theme.axis } } : undefined,
        xAxis: {
            type: "category",
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
