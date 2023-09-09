import { log } from "architecture";
import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";

const goNextAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => () => {
        const {
            previousSections,
            previousArray,
            nextSections,
            nextArray,
            position,
            section,
            header,
            builder,
        } = get();
        const nextPosition = nextArray.pop();
        if (!nextPosition) {
            log.error("nextPosition is undefined");
            return;
        }
        const nextSection = nextSections.get(nextPosition);
        if (!nextSection) {
            log.error("nextSection is undefined");
            return;
        }
        log.trace(`goNext from ${position} to ${nextPosition}`);
        nextSections.delete(nextPosition);
        previousArray.push(position);
        previousSections.set(position, {
            header: header,
            section: section,
            path: nextSection.path,
            element: nextSection.element,
        });
        builder.info.addPath(nextSection.path, position)
            .addFinalElement(nextSection.element, position);

        set({
            position: nextPosition,
            nextSections: nextSections,
            previousSections: previousSections,
            section: nextSection.section,
            header: nextSection.header,
            builder,
        });
    };

export default goNextAction;