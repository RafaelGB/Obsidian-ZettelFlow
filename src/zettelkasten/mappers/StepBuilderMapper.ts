import { StepBuilderInfo, StepSettings } from "zettelkasten";

export class StepBuilderMapper {
    public static StepBuilderInfo2StepSettings(info: StepBuilderInfo): StepSettings {
        const { element, label, childrenHeader, targetFolder, isRoot } = info;
        return {
            root: isRoot,
            element,
            label,
            childrenHeader,
            targetFolder

        }
    }

    public static StepSettings2PartialStepBuilderInfo(settings: StepSettings): Partial<Omit<StepBuilderInfo, "containerEl">> {
        const { root, element, label, childrenHeader, targetFolder } = settings;
        return {
            isRoot: root,
            element,
            label,
            childrenHeader,
            targetFolder
        }
    }
}