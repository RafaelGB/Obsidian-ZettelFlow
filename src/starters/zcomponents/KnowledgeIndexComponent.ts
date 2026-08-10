import { PluginComponent } from "architecture";
import { KnowledgeIndex, SemanticRelationSchema } from "architecture/knowledge";
import { DEFAULT_STATE_PROPERTY, LifecycleStateSchema } from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import { Platform } from "obsidian";
import ZettelFlow from "main";

/**
 * Bootstraps the read-only {@link KnowledgeIndex} (#145): registers the lifecycle {@link
 * LifecycleStateSchema} (#146) and the {@link SemanticRelationSchema} (#147) so notes are
 * classified by state and typed relations, then wires the four vault events and triggers the
 * initial build once the workspace layout is ready. Inline `key::` relation enrichment runs
 * deferred after that build when enabled (default on desktop, off on mobile).
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
            relations: new SemanticRelationSchema(),
        });
        const parseInlineRelations =
            this.plugin.settings?.relations?.parseInlineRelations ?? !Platform.isMobile;
        index.bootstrap(this.plugin, { parseInlineRelations });
    }
}
