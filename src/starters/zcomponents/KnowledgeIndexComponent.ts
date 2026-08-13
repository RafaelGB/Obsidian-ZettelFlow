import { PluginComponent } from "architecture";
import { ClaimSourceSchema, KnowledgeIndex, SemanticRelationSchema } from "architecture/knowledge";
import { DEFAULT_STATE_PROPERTY, LifecycleStateSchema } from "architecture/knowledge/lifecycle";
import { buildLifecycleAliases } from "architecture/knowledge/lifecycleAliases";
import { Platform } from "obsidian";
import ZettelFlow from "main";

/**
 * Bootstraps the read-only {@link KnowledgeIndex} (#145): registers the lifecycle {@link
 * LifecycleStateSchema} (#146), the {@link SemanticRelationSchema} (#147) and the {@link
 * ClaimSourceSchema} (#148) so notes are classified by state, typed relations, and claims/sources,
 * then wires the four vault events and triggers the initial build once the workspace layout is
 * ready. Inline `key::` enrichment (relations + claims/sources) runs deferred after that build when
 * enabled (default on desktop, off on mobile).
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
            claims: new ClaimSourceSchema(),
        });
        const parseInlineRelations =
            this.plugin.settings?.relations?.parseInlineRelations ?? !Platform.isMobile;
        index.bootstrap(this.plugin, { parseInlineRelations });
    }
}
