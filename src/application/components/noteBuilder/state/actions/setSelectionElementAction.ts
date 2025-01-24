import { log } from "architecture";
import { NoteBuilderState, SectionElementOptions, StoreNoteBuilderModifier } from "application/components/noteBuilder";
import { SectionType } from "application/components/section";
import { JSX } from "react";

const setSelectionElementAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => (element: JSX.Element, config: Partial<SectionElementOptions>) => {
        log.trace(`setSelectionElementAction - config: ${JSON.stringify(config)}`);
        const { previousSections, previousArray, section, position, header, builder, actionWasTriggered } = get();
        const { savePrevious = true, isOptional = false, actionType } = config;
        const elementSection: SectionType = {
            ...section,
            element: element,
        };
        if (savePrevious) {
            previousArray.push(position);
            const element = builder.note.getElement(position);
            const savedSection = {
                header,
                section,
                element: element,
                isAction: actionWasTriggered,
                actionType: element?.type
            };

            previousSections.set(position, savedSection);
        }
        log.trace(`section set from ${position} to ${position + 1}`);
        set({
            position: position + 1,
            section: elementSection,
            previousSections: previousSections,
            enableSkip: isOptional,
            actionWasTriggered: false,
            currentAction: actionType,
        });

    };

export default setSelectionElementAction;