export type Completion = {
    label: string;
    type: string;
    info: string;
    detail: string;
    boost: number;
    render?: (completion: Completion) => string;
};