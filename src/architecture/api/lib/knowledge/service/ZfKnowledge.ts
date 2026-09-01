import { App } from "obsidian";
import { LibModule } from "../../LibModule";
import { knowledgeApi, type KnowledgeApiDeps } from "../knowledgeApi";
import { KnowledgeIndex } from "architecture/knowledge/KnowledgeIndex";
import { JudgementLog } from "architecture/plugin/judgement/JudgementLog";
import type { KnowledgeModel } from "architecture/knowledge/model/KnowledgeModel";

/** Thrown when a projection is called before the index has finished building. */
export const INDEX_NOT_READY =
    "ZettelFlow's knowledge index is still building. Await zf.knowledge.ready() before querying it.";

/**
 * Runtime binder for `zf.knowledge` (#350): the impure half that the pure {@link knowledgeApi} table
 * must not know about — the live {@link KnowledgeIndex} and the {@link JudgementLog}.
 *
 * The model is read **per call**, never captured: `fnsManager` caches the built `zf` object for the
 * session, so a captured model would hand every later script a snapshot of the graph as it was when the
 * API was first assembled.
 *
 * A projection called before the index is ready **throws** rather than returning an empty result. An
 * empty result would read as *"your vault is empty"* — the worst available lie for a knowledge tool,
 * and one the script author would have no way to tell apart from the truth.
 */
export class ZfKnowledge extends LibModule {
    name = "knowledge";

    constructor(app: App, private deps: KnowledgeApiDeps = defaultDeps()) {
        super(app);
    }

    create_static_functions(): Promise<void> {
        this.register("ready", () => this.deps.ready(), {
            signature: "() => boolean",
            summary: "Whether the knowledge index has finished building.",
        });
        this.register("model", () => this.deps.model(), {
            signature: "() => KnowledgeModel",
            summary: "The raw idea graph, for questions no projection answers.",
        });

        for (const [name, member] of Object.entries(knowledgeApi(this.deps))) {
            this.register(name, member.call, {
                signature: member.signature,
                summary: member.summary,
            });
        }
        return Promise.resolve();
    }

    protected namespace(): string {
        return "zf.knowledge";
    }
}

/** Live accessors over the plugin's singletons. */
function defaultDeps(): KnowledgeApiDeps {
    return {
        ready: () => KnowledgeIndex.getInstance().status === "ready",
        history: () => JudgementLog.getInstance().entries(),
        model: (): KnowledgeModel => {
            const index = KnowledgeIndex.getInstance();
            if (index.status !== "ready") throw new Error(INDEX_NOT_READY);
            return index.getModel();
        },
    };
}
