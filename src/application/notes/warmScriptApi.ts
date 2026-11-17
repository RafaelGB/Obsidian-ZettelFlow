import { log } from "architecture";

/**
 * Start building the `zf` API while the wizard is being answered (#904).
 *
 * The first script step of a flow used to build it, so the note sat on "Creating the note… 6/11"
 * while every library module was loaded — half a minute on a cold start. Built here, it is ready (or
 * nearly) by the time a step needs it. The build is cached, so a warm call is free. A failure is
 * only logged: the step that needs `zf` builds it again and reports what went wrong there.
 */
export function warmScriptApi(build: () => Promise<unknown>): void {
    build().catch((error: unknown) => {
        log.warn("[scripts] could not prepare the script API ahead of the flow", error);
    });
}
