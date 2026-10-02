/**
 * Scatter / Bubble panel (pure). A bubble adds a size channel (symbol size) and a colour channel
 * (a continuous `visualMap`) — the multidimensional case the maintainer's productivity chart needs.
 * Epic #622, S4 #626.
 */
import type { EChartsOption } from "echarts";
import type { DataStoreSnapshot } from "dashboards/datastore";
import type { ChartTheme } from "../theme";
import type { PanelConfig } from "../types";

export function buildScatterOption(
    snapshot: DataStoreSnapshot,
    config: PanelConfig,
    theme: ChartTheme,
    bubble: boolean,
): EChartsOption {
    const { x, y, size, color } = config.mapping;
    const xIsDate = x ? snapshot.schema.byId[x]?.type === "date" : false;

    // The 5th dimension is the row index — not drawn, but it is how a click finds its note.
    const points = snapshot.rows
        .map((row, rowIndex) => {
            const xRaw = x ? row[x]?.raw : null;
            const yRaw = y ? row[y]?.raw : null;
            const sizeRaw = bubble && size ? row[size]?.raw : null;
            const colorRaw = bubble && color ? row[color]?.raw : null;
            const xVal = xIsDate && typeof xRaw === "string" ? Date.parse(xRaw) : typeof xRaw === "number" ? xRaw : NaN;
            const yVal = typeof yRaw === "number" ? yRaw : NaN;
            return [
                xVal,
                yVal,
                typeof sizeRaw === "number" ? sizeRaw : 0,
                typeof colorRaw === "number" ? colorRaw : 0,
                rowIndex,
            ];
        })
        .filter((point) => !Number.isNaN(point[0]) && !Number.isNaN(point[1]));

    const option: EChartsOption = {
        backgroundColor: "transparent",
        textStyle: { color: theme.text },
        grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
        tooltip: { trigger: "item" },
        xAxis: {
            type: xIsDate ? "time" : "value",
            axisLine: { lineStyle: { color: theme.split } },
            axisLabel: { color: theme.axis },
            splitLine: { lineStyle: { color: theme.split } },
        },
        yAxis: {
            type: "value",
            splitLine: { lineStyle: { color: theme.split } },
            axisLabel: { color: theme.axis },
        },
        series: [
            {
                type: "scatter",
                data: points,
                large: true,
                largeThreshold: 2000,
                progressive: 2000,
                symbolSize:
                    bubble && size ? (value: number[]) => Math.max(6, Math.sqrt(Math.abs(value[2])) * 6) : 10,
                itemStyle: { color: theme.palette[0] },
            },
        ],
    };

    if (bubble && color && points.length > 0) {
        const colorValues = points.map((point) => point[3]);
        option.visualMap = {
            show: false,
            dimension: 3,
            min: Math.min(...colorValues),
            max: Math.max(...colorValues),
            inRange: { color: [theme.palette[4], theme.palette[1], theme.palette[0]] },
        };
    }

    return option;
}
