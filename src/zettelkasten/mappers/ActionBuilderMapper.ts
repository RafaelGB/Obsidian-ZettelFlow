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
}