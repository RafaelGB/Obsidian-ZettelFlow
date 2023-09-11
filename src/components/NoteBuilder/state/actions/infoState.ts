import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";

const infoStep =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => {
        return {
            wasActionTriggered: () => get().actionWasTriggered,
            getTitle: () => get().title,
            getCurrentStep: () => get().currentStep,
        }

    };

export default infoStep;