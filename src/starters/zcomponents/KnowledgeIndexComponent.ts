import { PluginComponent } from "architecture";
import { KnowledgeIndex } from "architecture/knowledge";
import { DEFAULT_STATE_PROPERTY, LifecycleStateSchema } from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import ZettelFlow from "main";

/**
 * Bootstraps the read-only {@link KnowledgeIndex} (#145): registers the lifecycle {@link
 * LifecycleStateSchema} (#146) so notes are classified by state, then wires the four vault events
 * and triggers the initial build once the workspace layout is ready.
 */
export class KnowledgeIndexComponent extends PluginComponent {
    constructor(private plugin: ZettelFlow) {
        super(plugin);
    }

    onLoad(): void {
        const index = KnowledgeIndex.getInstance();
        const stateProperty = this.plugin.settings?.lifecycle?.stateProperty || DEFAULT_STATE_PROPERTY;
        index.registerSchemas({
            state: new LifecycleStateSchema(stateProperty, buildLifecycleAliases()),
        });
        index.bootstrap(this.plugin);
    }
}
