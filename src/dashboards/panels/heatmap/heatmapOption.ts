/** Heatmap (matrix) panel (pure): x category × y category → coloured value. Epic #622, S4 #626. */
import type { EChartsOption } from "echarts";
import type { DataStoreSnapshot } from "dashboards/datastore";
import type { ChartTheme } from "../theme";
import type { PanelConfig } from "../types";

export function buildHeatmapMatrixOption(
    snapshot: DataStoreSnapshot,
    config: PanelConfig,
    theme: ChartTheme,
): EChartsOption {
    const { x, y, value } = config.mapping;
    if (!x || !y || !value) return { series: [] };

    const xs: string[] = [];
    const ys: string[] = [];
    const xIndex = new Map<string, number>();
    const yIndex = new Map<string, number>();
    const indexOf = (labels: string[], map: Map<string, number>, key: string): number => {
        const existing = map.get(key);
        if (existing !== undefined) return existing;
        const next = labels.length;
        labels.push(key);
        map.set(key, next);
        return next;
    };

    const data: number[][] = [];
    let max = 0;
    for (const row of snapshot.rows) {
        const raw = row[value]?.raw;
        const amount = typeof raw === "number" ? raw : 0;
        data.push([
            indexOf(xs, xIndex, row[x]?.display ?? ""),
            indexOf(ys, yIndex, row[y]?.display ?? ""),
            amount,
        ]);
        if (amount > max) max = amount;
    }

    return {
        backgroundColor: "transparent",
        textStyle: { color: theme.text },
        grid: { left: 8, right: 16, top: 24, bottom: 32, containLabel: true },
        tooltip: { position: "top" },
        xAxis: {
            type: "category",
            data: xs,
            axisLine: { lineStyle: { color: theme.split } },
            axisLabel: { color: theme.axis },
        },
        yAxis: {
            type: "category",
            data: ys,
            axisLine: { lineStyle: { color: theme.split } },
            axisLabel: { color: theme.axis },
        },
        visualMap: {
            min: 0,
            max: max || 1,
            calculable: true,
            orient: "horizontal",
            left: "center",
            bottom: 0,
            inRange: { color: [theme.split, theme.palette[0]] },
            textStyle: { color: theme.axis },
        },
        series: [{ type: "heatmap", data }],
    };
}
