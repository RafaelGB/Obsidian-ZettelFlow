import { StepBuilderInfo, StepSettings } from "zettelkasten";

export class StepBuilderMapper {
    public static StepBuilderInfo2StepSettings(info: StepBuilderInfo): StepSettings {
        const { label, childrenHeader, targetFolder, isRoot, optional, actions } = info;
        return {
            root: isRoot,
            actions,
            label,
            childrenHeader,
            targetFolder,
            optional
        }
    }

    public static StepSettings2PartialStepBuilderInfo(settings: StepSettings): Partial<Omit<StepBuilderInfo, "containerEl">> {
        const { root, element, label, childrenHeader, targetFolder, optional } = settings;
        return {
            isRoot: root,
            element,
            label,
            childrenHeader,
            targetFolder,
            optional
        }
    }
}