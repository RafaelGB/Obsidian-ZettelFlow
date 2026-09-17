/**
 * What a failing script should do to the work around it (#445, epic #443) — pure.
 *
 * Every failure did the same thing: a `Notice`, and the surrounding work carried on. That was a
 * deliberate fix once — a Script action used to swallow its error and let the note be created as
 * if the step had worked — but one policy cannot be right for five surfaces and every script.
 *
 * A hook that tags a note has no business interrupting you when it fails. A step that computes the
 * note's title has no business letting the note be created without one. The script says which it
 * is; absence says *notify*, which is exactly today's behaviour.
 */

export type ScriptErrorPolicy = "notify" | "silent" | "skip" | "stop";

/** The four, in the order the form offers them: least to most disruptive. */
export const SCRIPT_ERROR_POLICIES: readonly ScriptErrorPolicy[] = [
    "notify",
    "silent",
    "skip",
    "stop",
] as const;

export const POLICY_LABEL_KEY: Record<ScriptErrorPolicy, string> = {
    notify: "script_policy_notify",
    silent: "script_policy_silent",
    skip: "script_policy_skip",
    stop: "script_policy_stop",
};

export const POLICY_DESCRIPTION_KEY: Record<ScriptErrorPolicy, string> = {
    notify: "script_policy_notify_desc",
    silent: "script_policy_silent_desc",
    skip: "script_policy_skip_desc",
    stop: "script_policy_stop_desc",
};

export interface PolicyOutcome {
    /** Tell the person at the keyboard. */
    notify: boolean;
    /** Abandon the rest of the step this script belongs to. */
    skipStep: boolean;
    /** Stop the whole note build. */
    stopBuild: boolean;
}

/**
 * What to do about a failure. The record is written either way — *silent* is about not
 * interrupting you, never about hiding the fact that it happened (#444).
 */
export function applyErrorPolicy(policy: ScriptErrorPolicy | undefined): PolicyOutcome {
    switch (policy) {
        case "silent":
            return { notify: false, skipStep: false, stopBuild: false };
        case "skip":
            return { notify: true, skipStep: true, stopBuild: false };
        case "stop":
            return { notify: true, skipStep: false, stopBuild: true };
        default:
            // Absent or unrecognised: what the product has always done.
            return { notify: true, skipStep: false, stopBuild: false };
    }
}

/** Whether a policy changes anything about the work around the script. */
export function interrupts(policy: ScriptErrorPolicy | undefined): boolean {
    const outcome = applyErrorPolicy(policy);
    return outcome.skipStep || outcome.stopBuild;
}
