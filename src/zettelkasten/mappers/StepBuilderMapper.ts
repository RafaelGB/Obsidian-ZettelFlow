import { StepBuilderInfo, StepSettings } from "zettelkasten";

export class StepBuilderMapper {
    public static StepBuilderInfo2StepSettings(info: StepBuilderInfo): StepSettings {
        const { element, label, childrenHeader } = info;
        return {
            root: info.isRoot,
            element: {
                type: "bridge",
                color: "",
                ...element,
            },
            label,
            childrenHeader
        }
    }
}