import { actionsStore } from "architecture/api";
import { SectionElement } from "zettelkasten";

export class ZettelkastenTypeService {
    public static isSectionType(value: string) {
        const actionKeys = actionsStore.getActionsKeys();
        return actionKeys.includes(value);
    }

    public static isSectionAction(value: any): value is SectionElement {
        return value && typeof value === "object" && typeof value.type === "string" && ZettelkastenTypeService.isSectionType(value.type);
    }
}