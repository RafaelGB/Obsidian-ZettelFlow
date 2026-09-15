import { describe, it, expect } from "@jest/globals";
import {
    MAX_FAILURE_MESSAGE,
    describeFailure,
    recoveryActions,
} from "application/components/noteBuilder/wizardRecovery";

describe("a broken step offers the recoveries that exist (#417)", () => {
    it("offers everything when everything is possible", () => {
        expect(
            recoveryActions({ canGoBack: true, canSkip: true, hasContent: true })
        ).toEqual(["retry", "back", "skip", "build"]);
    });

    it("never offers a note when nothing has been answered", () => {
        expect(
            recoveryActions({ canGoBack: false, canSkip: false, hasContent: false })
        ).toEqual(["retry"]);
    });

    it("never offers going back from the first step", () => {
        expect(
            recoveryActions({ canGoBack: false, canSkip: false, hasContent: true })
        ).toEqual(["retry", "build"]);
    });

    it("only offers skipping an optional step", () => {
        expect(recoveryActions({ canGoBack: true, canSkip: false, hasContent: false })).toEqual([
            "retry",
            "back",
        ]);
    });

    it("stops offering a retry that already failed, instead of looping", () => {
        expect(
            recoveryActions({ canGoBack: true, canSkip: false, hasContent: true, retried: true })
        ).toEqual(["back", "build"]);
    });
});

describe("whatever a component throws becomes one readable line (#417)", () => {
    it("reads an Error", () => {
        expect(describeFailure(new Error("Only one element on document allowed"))).toBe(
            "Only one element on document allowed"
        );
    });

    it("reads a thrown string and an object with a message", () => {
        expect(describeFailure("boom")).toBe("boom");
        expect(describeFailure({ message: "nope" })).toBe("nope");
    });

    it("falls back rather than showing nothing", () => {
        expect(describeFailure(undefined)).toBe("Unknown error");
        expect(describeFailure(null)).toBe("Unknown error");
        expect(describeFailure(new Error(""))).toBe("Unknown error");
        expect(describeFailure({})).toBe("Unknown error");
    });

    it("collapses whitespace and bounds the length — a stack in a modal helps nobody", () => {
        expect(describeFailure(new Error("line one\n  line two"))).toBe("line one line two");
        const long = describeFailure(new Error("x".repeat(MAX_FAILURE_MESSAGE + 50)));
        expect(long.length).toBe(MAX_FAILURE_MESSAGE);
        expect(long.endsWith("…")).toBe(true);
    });
});
