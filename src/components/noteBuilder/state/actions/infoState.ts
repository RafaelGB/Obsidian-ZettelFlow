import { NoteBuilderState } from "components/noteBuilder";

const infoStep =
    (get: () => NoteBuilderState) => {
        return {
            wasActionTriggered: () => get().actionWasTriggered,
            getTitle: () => get().title,
            getCurrentStep: () => get().currentStep
        }
    };

export default infoStep;