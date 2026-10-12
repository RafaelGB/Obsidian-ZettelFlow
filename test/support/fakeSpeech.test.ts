import { describe, it, expect, jest } from "@jest/globals";
import { FakeSpeech, fakeUtterance } from "./fakeSpeech";

/** The fake speech engine Listen's tests run on (#765 T2). */
describe("a fake speech engine", () => {
    it("queues what it is asked to say, and ends one at a time", () => {
        const speech = new FakeSpeech();
        const a = fakeUtterance("One.");
        const b = fakeUtterance("Two.");
        const ended = jest.fn();
        a.onend = ended;
        speech.speak(a);
        speech.speak(b);
        expect(speech.text).toBe("One.");
        speech.endCurrent();
        expect(ended).toHaveBeenCalledTimes(1);
        expect(speech.text).toBe("Two.");
    });

    it("drops the queue on cancel, answering what it dropped with interrupted", () => {
        const speech = new FakeSpeech();
        const a = fakeUtterance("One.");
        const error = jest.fn();
        a.onerror = error;
        speech.speak(a);
        speech.cancel();
        expect(speech.text).toBeNull();
        expect(error).toHaveBeenCalledWith({ error: "interrupted" });
        expect(speech.cancels).toEqual([1]);
    });

    it("lists its voices late, on voiceschanged, with their localService flags", () => {
        const remote = FakeSpeech.voice({ name: "Cloud", localService: false });
        const speech = new FakeSpeech([remote, FakeSpeech.voice()]).voicesLater();
        const changed = jest.fn();
        speech.addEventListener("voiceschanged", changed);
        expect(speech.getVoices()).toEqual([]);
        speech.listVoices();
        expect(changed).toHaveBeenCalled();
        expect(speech.getVoices().map((v) => v.localService)).toEqual([false, true]);
    });
});
