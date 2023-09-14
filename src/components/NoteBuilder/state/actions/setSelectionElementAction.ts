import { log } from "architecture";
import { NoteBuilderState, StoreNoteBuilderModifier } from "components/NoteBuilder";
import { SectionElementOptions } from "components/NoteBuilder/model/NoteBuilderModel";
import { SectionType } from "components/core";

const setSelectionElementAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => (element: JSX.Element, config: SectionElementOptions = {
        savePrevious: true,
        isOptional: false,
        isAction: false,
    }) => {
        log.trace(`setSelectionElementAction - config: ${JSON.stringify(config)}`);
        const { previousSections, previousArray, section, position, header, builder, actionWasTriggered } = get();
        const { savePrevious, isOptional, isAction = false } = config;
        const elementSection: SectionType = {
            ...section,
            element: element,
        };
        if (savePrevious) {
            previousArray.push(position);
            previousSections.set(position, {
                header,
                section,
                element: builder.info.getElement(position),
                isAction: actionWasTriggered,
            });
        }
        log.trace(`section set from ${position} to ${position + 1}`);
        set({
            position: position + 1,
            section: elementSection,
            previousSections: previousSections,
            enableSkip: isOptional,
            actionWasTriggered: isAction,
        });

    };

export default setSelectionElementAction;