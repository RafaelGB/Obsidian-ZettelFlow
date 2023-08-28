import { StepBuilderInfo, StepSettings } from "zettelkasten";

export class StepBuilderMapper {
    public static StepBuilderInfo2StepSettings(info: StepBuilderInfo): StepSettings {
        const { element, label, childrenHeader } = info;
        return {
            root: info.isRoot,
            element,
            label,
            childrenHeader
        }
    }

    public static StepSettings2PartialStepBuilderInfo(settings: StepSettings): Partial<Omit<StepBuilderInfo, "containerEl">> {
        const { root, element, label, childrenHeader } = settings;
        return {
            isRoot: root,
            element,
            label,
            childrenHeader
        }
    }
}