import { FinalElement } from "application/notes";

export type TaskManagementElement = {
    rollupHeader: string;
    regex: string;
    initialFolder?: string;
    prefix?: string;
    suffix?: string;
    isContent?: boolean;
    key?: string;
} & FinalElement;