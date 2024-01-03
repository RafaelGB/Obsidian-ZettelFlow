import { log } from "architecture";
import { NoteBuilderState, SectionElementOptions, StoreNoteBuilderModifier } from "application/components/noteBuilder";
import { SectionType } from "application/components/section";

const setSelectionElementAction =
    (set: StoreNoteBuilderModifier, get: () => NoteBuilderState) => (element: JSX.Element, config: SectionElementOptions) => {
        log.trace(`setSelectionElementAction - config: ${JSON.stringify(config)}`);
        const { previousSections, previousArray, section, position, header, builder, actionWasTriggered } = get();
        const { savePrevious = true, isOptional = false } = config;
        const elementSection: SectionType = {
            ...section,
            element: element,
        };
        if (savePrevious) {
            previousArray.push(position);
            previousSections.set(position, {
                header,
                section,
                element: builder.note.getElement(position),
                isAction: actionWasTriggered,
            });
        }
        log.trace(`section set from ${position} to ${position + 1}`);
        set({
            position: position + 1,
            section: elementSection,
            previousSections: previousSections,
            enableSkip: isOptional,
            actionWasTriggered: false,
        });

    };

export default setSelectionElementAction;