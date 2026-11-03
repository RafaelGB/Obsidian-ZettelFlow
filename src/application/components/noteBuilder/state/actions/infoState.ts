import { NoteBuilderState } from "application/components/noteBuilder";

const infoStep =
    (get: () => NoteBuilderState) => {
        return {
            wasActionTriggered: () => get().actionWasTriggered,
            getTitle: () => get().title,
            getCurrentNode: () => get().currentNode,
            getElements: () => get().builder.note.getElements()
        }
    };

export default infoStep;