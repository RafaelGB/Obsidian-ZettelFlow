import { FinalElement } from "application/notes";

export type TaskManagementElement = {
    rolloverHeader: string;
    regex: string;
    initialFolder?: string;
    recursiveFolders?: boolean;
    prefix?: string;
    suffix?: string;
    isContent?: boolean;
    key?: string;
} & FinalElement;