import { SectionElement, TypeOption } from "zettelkasten";

export class ZettelkastenTypeService {
    public static isSectionType(value: string): value is TypeOption {
        return (value === "bridge" || value === "prompt" || value === "calendar");
    }

    public static isSectionElement(value: any): value is SectionElement {
        return value && typeof value === "object" && typeof value.type === "string" && ZettelkastenTypeService.isSectionType(value.type);
    }
}