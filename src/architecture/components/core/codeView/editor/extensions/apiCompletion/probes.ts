import { fnsManager } from "architecture/api";
import { ObsidianApi } from "architecture";
import { ContentDTO, NoteDTO } from "application/notes";
import type { HookEvent } from "hooks/typing";

/**
 * A **probe** is a representative live value for one script binding (#351): what the editor
 * introspects to know what `content.` or `event.` can offer.
 *
 * This is the one table in the completion system, and deliberately so — it holds *values*, not
 * descriptions. The members come from the value, so a probe cannot get a member's name, arity or
 * existence wrong; it can only be the wrong kind of thing entirely, which shows up immediately.
 *
 * `zf` and `app` probe the genuine runtime objects, which is why `zf.internal.user.` lists your own
 * library scripts and `zf.external.dv.` lists Dataview's real API.
 */

/** The `event` a hook receives. Typed as the real {@link HookEvent}, so a shape change fails to compile. */
const hookEventProbe: HookEvent = {
    file: null as unknown as HookEvent["file"],
    request: { oldValue: undefined, newValue: undefined, property: "", frontmatter: {} },
    response: { frontmatter: {}, removeProperties: [] },
};

/** Probes by binding name. A binding with no probe simply offers no members. */
const PROBES: Record<string, () => unknown> = {
    zf: () => fnsManager.getFns(),
    app: () => ObsidianApi.globalApp(),
    content: () => new ContentDTO(),
    note: () => new NoteDTO(),
    context: () => ({}),
    element: () => ({ type: "", id: "", code: "" }),
    event: () => hookEventProbe,
};

/** The live value to introspect for a binding, or `undefined` when it has nothing to offer. */
export async function probeFor(binding: string): Promise<unknown> {
    const probe = PROBES[binding];
    if (!probe) return undefined;
    try {
        return await probe();
    } catch {
        // A probe that cannot resolve (no vault yet, a broken scripts folder) simply yields no
        // completions — an editor must never break because the API could not be built.
        return undefined;
    }
}

/** Whether a binding can be introspected at all. */
export function hasProbe(binding: string): boolean {
    return binding in PROBES;
}
