import { PluginComponent } from "architecture";
import ZettelFlow from "main";
import { HOVER_PREVIEW_SOURCE } from "architecture/components/core/a11y";

/**
 * Register ZettelFlow with Obsidian's "Page preview" core plugin (#594).
 *
 * Once registered, any note-name element wired with `hoverPreview(...)` shows the native preview
 * popover on hover. `defaultMod: true` requires the Ctrl/Cmd key by default — the behaviour the
 * request asked for — and the user can change it in Settings → Page preview. `display` matches the
 * plugin name, as the API asks. Registered once on load; if the core plugin is disabled the source
 * is simply never asked for a preview.
 */
export class HoverPreviewComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        this.plugin.registerHoverLinkSource(HOVER_PREVIEW_SOURCE, {
            display: "ZettelFlow",
            defaultMod: true,
        });
    }
}
