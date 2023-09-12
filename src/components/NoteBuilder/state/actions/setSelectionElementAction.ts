import { log } from "architecture";
import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";
import { SectionElementOptions } from "components/NoteBuilder/model/NoteBuilderModel";
import { SectionType } from "components/core";

const setSelectionElementAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => (element: JSX.Element, config: SectionElementOptions = {
        savePrevious: true,
        isOptional: false,
    }) => {
        log.trace(`setSelectionElementAction - config: ${JSON.stringify(config)}`);
        const { previousSections, previousArray, section, position, header, builder } = get();
        const { savePrevious, isOptional } = config;
        const elementSection: SectionType = {
            ...section,
            element: element,
        };
        if (savePrevious) {
            previousArray.push(position);
            previousSections.set(position, {
                header: header,
                section: section,
                element: builder.info.getElement(position),
            });
        }
        log.trace(`section set from ${position} to ${position + 1}`);
        set({
            position: position + 1,
            section: elementSection,
            previousSections: previousSections,
            enableSkip: isOptional,
        });

    };

export default setSelectionElementAction;