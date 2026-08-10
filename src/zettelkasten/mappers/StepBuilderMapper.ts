import { CommunityStepSettings } from "config";
import { StepBuilderInfo, StepSettings } from "zettelkasten";
import { v4 as uuid4 } from "uuid";

export class StepBuilderMapper {
    public static StepBuilderInfo2StepSettings(info: StepBuilderInfo): StepSettings {
        const { label, childrenHeader, targetFolder, root, optional, actions, phase } = info;
        const settings: StepSettings = {
            root,
            actions,
            label,
            childrenHeader,
            targetFolder,
            optional
        };
        // Omit `phase` entirely when unset so a legacy/unphased step round-trips without the key.
        if (phase !== undefined) settings.phase = phase;
        return settings;
    }

    public static StepBuilderInfo2CommunityStepSettings(info: StepBuilderInfo, origin: Partial<CommunityStepSettings>): CommunityStepSettings {
        const { label, childrenHeader, targetFolder, root, optional, actions, phase, title = "", description = "" } = info;
        const { author = "You", id = uuid4() } = origin;
        const settings: CommunityStepSettings = {
            ...origin,
            template_type: "step",
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
        };
        if (phase !== undefined) settings.phase = phase;
        return settings;
    }

    public static StepSettings2PartialStepBuilderInfo(settings: StepSettings): Partial<Omit<StepBuilderInfo, "containerEl">> {
        const { root, label, childrenHeader, targetFolder, optional, actions, phase } = settings;
        const info: Partial<Omit<StepBuilderInfo, "containerEl">> = {
            root,
            label,
            childrenHeader,
            targetFolder,
            optional,
            actions
        };
        if (phase !== undefined) info.phase = phase;
        return info;
    }
}
