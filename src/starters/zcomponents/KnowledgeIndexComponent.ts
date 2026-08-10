import { PluginComponent } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import ZettelFlow from "main";

/**
 * Bootstraps the read-only {@link KnowledgeIndex} (#145): on load it wires the four vault events
 * and triggers the initial build once the workspace layout is ready.
 */
export class KnowledgeIndexComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        KnowledgeIndex.getInstance().bootstrap(this.plugin);
    }
}
