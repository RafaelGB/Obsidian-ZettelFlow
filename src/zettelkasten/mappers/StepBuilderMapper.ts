import { CommunityStepSettings } from "config";
import { StepBuilderInfo, StepSettings } from "zettelkasten";

export class StepBuilderMapper {
    public static StepBuilderInfo2StepSettings(info: StepBuilderInfo): StepSettings {
        const { label, childrenHeader, targetFolder, root, optional, actions } = info;
        return {
            root,
            actions,
            label,
            childrenHeader,
            targetFolder,
            optional
        }
    }

    public static StepBuilderInfo2CommunityStepSettings(info: StepBuilderInfo, origin: CommunityStepSettings): CommunityStepSettings {
        const { label, childrenHeader, targetFolder, root, optional, actions, title = "", description = "" } = info;
        return {
            ...origin,
            title,
            description,
            root,
            actions,
            label,
            childrenHeader,
            targetFolder,
            optional
        }
    }

    public static StepSettings2PartialStepBuilderInfo(settings: StepSettings): Partial<Omit<StepBuilderInfo, "containerEl">> {
        const { root, label, childrenHeader, targetFolder, optional, actions } = settings;
        return {
            root,
            label,
            childrenHeader,
            targetFolder,
            optional,
            actions
        }
    }
}