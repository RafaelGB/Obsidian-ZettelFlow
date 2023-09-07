import { log } from "architecture";
import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";

const goNextAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => () => {
        const {
            previousSections,
            nextSections,
            position,
            section,
            header,
            builder,
        } = get();
        if (nextSections.size === 0) return;
        const nextPosition = position + 1;
        const nextSection = nextSections.get(nextPosition);
        if (!nextSection) return;
        log.trace(`goNext from ${position} to ${nextPosition}`);
        nextSections.delete(nextPosition);
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