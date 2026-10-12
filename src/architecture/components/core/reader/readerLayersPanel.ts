import type { Component } from "obsidian";
import { c } from "architecture";
import { t } from "architecture/lang";
import { MARK_LAYERS, type MarkLayer } from "application/thinking/markLayer";
import { LAYER_LABEL } from "./readerHighlights";
import { panelHead, type PanelClose } from "./readerPanelHead";
import { segmentedRow, type MarkerSnapshot } from "./readerTypePanel";

type LocaleKey = Parameters<typeof t>[0];

/** What each layer is for, in a line (#758 FR-1). A literal map, so the locale guardrail sees it. */
const LAYER_DESC: Record<MarkLayer, LocaleKey> = {
    reading: "reader_layer_reading_desc",
    reflection: "reader_layer_reflection_desc",
    research: "reader_layer_research_desc",
};

/** What the panel shows: the reading's layers as they are now. */
export interface LayersModel {
    /** The layers with a mark on screen; the others are dimmed — never a number (FR-3). */
    present: ReadonlySet<MarkLayer>;
    hidden: readonly MarkLayer[];
    target: MarkLayer;
    clean: boolean;
}

/** What the panel's controls do. */
export interface LayersActions {
    show(layer: MarkLayer, on: boolean): void;
    target(layer: MarkLayer): void;
    hideAll(): void;
    reveal(): void;
}

/**
 * **The Layers panel** (#758 FR-3): each layer with what it is for and a switch to show it, where new
 * marks go, and *Hide my annotations* — or, reading clean, *Reveal my thinking*. The choice of where
 * new marks go is the Type panel's own segmented row, its marker sliding to the new answer.
 */
export function renderLayersPanel(host: HTMLElement, model: LayersModel, scope: Component, actions: LayersActions, close?: PanelClose, before?: MarkerSnapshot): void {
    panelHead(host, "reader_layers", close);
    const list = host.createDiv({ cls: c("reader-layers") });
    for (const layer of MARK_LAYERS) {
        const shown = !model.hidden.includes(layer);
        const row = list.createDiv({ cls: [c("reader-layer"), ...(model.present.has(layer) ? [] : [c("reader-layer--empty")])], attr: { "data-layer": layer } });
        const words = row.createDiv({ cls: c("reader-layer-words") });
        words.createDiv({ cls: c("reader-layer-name"), text: t(LAYER_LABEL[layer]) });
        words.createDiv({ cls: c("reader-layer-desc"), text: t(LAYER_DESC[layer]) });
        // Obsidian's own switch: a checkbox in its container, `is-enabled` when on.
        const toggle = row.createDiv({
            cls: ["checkbox-container", ...(shown ? ["is-enabled"] : [])],
            attr: { role: "switch", tabindex: "0", "aria-checked": String(shown), "aria-label": t("reader_layers_show_layer", t(LAYER_LABEL[layer])) },
        });
        toggle.createEl("input", { attr: { type: "checkbox", tabindex: "-1", ...(shown ? { checked: "" } : {}) } });
        scope.registerDomEvent(toggle, "click", (event: MouseEvent) => {
            event.preventDefault();
            actions.show(layer, !shown);
        });
        scope.registerDomEvent(toggle, "keydown", (event: KeyboardEvent) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            actions.show(layer, !shown);
        });
    }
    segmentedRow(host, { id: "layer-target", label: "reader_layers_target", options: MARK_LAYERS, current: model.target, key: (layer) => LAYER_LABEL[layer], onPick: (layer) => actions.target(layer) }, scope, before);
    const foot = host.createDiv({ cls: c("reader-layers-foot") });
    const button = foot.createEl("button", {
        cls: [c("reader-layers-clean"), ...(model.clean ? ["mod-cta"] : [])],
        text: t(model.clean ? "reader_reveal" : "reader_layers_hide_all"),
        attr: { type: "button", "data-zf-clean": model.clean ? "reveal" : "hide" },
    });
    scope.registerDomEvent(button, "click", () => (model.clean ? actions.reveal() : actions.hideAll()));
}
