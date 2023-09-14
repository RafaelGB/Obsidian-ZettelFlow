import { SectionElement, TypeOption } from "zettelkasten";

export class ZettelkastenTypeService {
    public static OPTION_TYPES: string[] = ["bridge", "prompt", "calendar", "selector"];
    public static isSectionType(value: string): value is TypeOption {
        return ZettelkastenTypeService.OPTION_TYPES.includes(value);
    }

    public static isSectionElement(value: any): value is SectionElement {
        return value && typeof value === "object" && typeof value.type === "string" && ZettelkastenTypeService.isSectionType(value.type);
    }
}