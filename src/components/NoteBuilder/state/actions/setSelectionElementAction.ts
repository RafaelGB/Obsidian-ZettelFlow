import { log } from "architecture";
import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";
import { SectionType } from "components/core";

const setSelectionElementAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => (element: JSX.Element, isRecursive = false) => {
        const { previousSections, previousArray, section, position, header, builder } = get();
        const elementSection: SectionType = {
            ...section,
            element: element,
        };
        if (!isRecursive) {
            previousArray.push(position);
            previousSections.set(position, {
                header: header,
                section: section,
                path: builder.info.getPath(position),
                element: builder.info.getElement(position),
            });
        }

        set({
            position: position + 1,
            section: elementSection,
            previousSections: previousSections,
        });
        log.trace(`section set from ${position} to ${position + 1}`);
    };

export default setSelectionElementAction;