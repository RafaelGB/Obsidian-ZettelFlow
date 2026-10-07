import { t } from "architecture/lang";
import { log } from "architecture/monitoring/Logger";
import { ObsidianApi } from "architecture/plugin/ObsidianAPI";
import type { Flow } from "architecture/plugin/canvas";
import { crystallizeSeed, type Crystallization, type CrystallizeSeed } from "application/thinking/crystallize";
import { recordCrystallizedThroughFlow } from "./crystallizeThought";

/**
 * Crystallizing into a new note, through the canvas that holds *Crystallizes thoughts* (#712).
 *
 * An ordinary flow, opened with what was made in Think — the accepted title, and the content
 * crystallizing would write — so its steps choose the folder, the template and the properties as
 * for any note. The preview the user confirmed stays the human accept; the verdict is recorded only
 * when the flow actually builds the note, and a wizard closed before that writes and records
 * nothing. This route never writes itself: the note goes through NoteBuilder's own write.
 */

/** The canvas that crystallizes thoughts, read at click time; "" means today's root write. */
export function crystallizeFlowPath(): string {
    try {
        return ObsidianApi.getOwnPlugin()?.settings?.crystallizeCanvas ?? "";
    } catch {
        return "";
    }
}

/** What the route needs from the world — injected, so the §XII rules are tested without a vault. */
export interface ThroughFlowDeps {
    loadFlow(path: string): Promise<Flow>;
    openWizard(flow: Flow, seed: CrystallizeSeed, onBuilt: (path: string) => void): void | Promise<void>;
    record(path: string, plan: Crystallization): void;
}

const LIVE: ThroughFlowDeps = {
    // Both loaded when they are needed: the canvas reader and the wizard are the whole note
    // builder, and Think must not carry them just to be able to offer them.
    loadFlow: async (path) => (await import("architecture/plugin/canvas")).canvas.flows.update(path),
    openWizard: async (flow, seed, onBuilt) => {
        const { SelectorMenuModal } = await import("zettelkasten");
        const plugin = ObsidianApi.getOwnPlugin();
        new SelectorMenuModal(plugin.app, plugin, flow).seedCrystallization(seed, onBuilt).open();
    },
    record: (path, plan) => recordCrystallizedThroughFlow(path, plan),
};

export interface ThroughFlowRequest {
    plan: Crystallization;
    /** The title as you accepted it in the preview. */
    title: string;
    /** The text as you edited it. */
    body: string;
    flowPath: string;
    /** Given the built note's path — only ever after it exists. */
    onDone: (path: string) => void;
}

/** Open the crystallize flow, seeded. `"failed"` when it cannot be opened — never a root fallback. */
export async function crystallizeThroughFlow(
    request: ThroughFlowRequest,
    deps: ThroughFlowDeps = LIVE
): Promise<"opened" | "failed"> {
    const seed = crystallizeSeed(
        request.plan,
        request.title.trim() || t("crystallize_untitled"),
        request.body,
        t("crystallize_born_from"),
        (count) => t("crystallize_and_more", count)
    );
    try {
        const flow = await deps.loadFlow(request.flowPath);
        await deps.openWizard(flow, seed, (path) => {
            deps.record(path, request.plan);
            request.onDone(path);
        });
        return "opened";
    } catch (error) {
        log.error(`[lab] could not open the crystallize flow ${request.flowPath}`, error);
        return "failed";
    }
}
