import { log } from "architecture";
import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";
import { SectionType } from "components/core";

const setSelectionElementAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => (element: JSX.Element, isRecursive?: boolean) => {
        const { previousSections, section, position, header, builder } = get();
        const elementSection: SectionType = {
            ...section,
            element: element,
        };
        if (position > 0 && !isRecursive) {
            previousSections.set(position, {
                header: header,
                section: section,
                path: builder.info.getPath(position - 1),
                element: builder.info.getElement(position - 1),
            });
        }
        set({
            position: position + 1,
            section: elementSection,
            previousSections: previousSections,
            nextSections: new Map(),
        });
        log.trace(`section set from ${position} to ${position + 1}`);
    };

export default setSelectionElementAction;