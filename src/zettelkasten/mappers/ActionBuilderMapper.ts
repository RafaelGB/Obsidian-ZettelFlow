import { Action } from "architecture/api";
import { CommunityAction } from "config";

export class ActionBuilderMapper {

    public static CommunityActionSettings2Action(communityAction: CommunityAction): Action {
        const { type, hasUI, description, id, // common
            title, downloads, author, // different
            ...action } = communityAction;
        return {
            ...action,
            hasUI,
            type,
            description,
            id
        }
    }

    public static Action2CommunityActionSettings(action: Action, partial: Partial<CommunityAction>): CommunityAction {
        const { type, hasUI, description = partial.description || "New action description", id, // common
            ...actionSettings } = action;
        return {
            ...actionSettings,
            template_type: "action",
            title: partial.title || "New action",
            author: partial.author || "You",
            hasUI,
            type,
            description,
            id
        }
    }
}