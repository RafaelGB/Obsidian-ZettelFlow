import { NoteBuilderState } from "application/components/noteBuilder";

const infoStep =
    (get: () => NoteBuilderState) => {
        return {
            wasActionTriggered: () => get().actionWasTriggered,
            getTitle: () => get().title,
            getCurrentNode: () => get().currentNode
        }
    };

export default infoStep;