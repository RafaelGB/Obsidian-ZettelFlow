import { actionsStore } from "architecture/api";

export class ZettelkastenTypeService {
    public static isSectionType(value: string) {
        const actionKeys = actionsStore.getActionsKeys();
        return actionKeys.includes(value);
    }
}