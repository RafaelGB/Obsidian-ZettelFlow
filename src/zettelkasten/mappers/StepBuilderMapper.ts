import { CommunityStepSettings } from "config";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { v4 as uuid4 } from "uuid";

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

    public static StepBuilderInfo2CommunityStepSettings(info: StepBuilderInfo, origin: Partial<CommunityStepSettings>): CommunityStepSettings {
        const { label, childrenHeader, targetFolder, root, optional, actions, title = "", description = "" } = info;
        const { author = "You", id = uuid4(), downloads = 0 } = origin;
        return {
            ...origin,
            template_type: "step",
            downloads,
            author,
            id,
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