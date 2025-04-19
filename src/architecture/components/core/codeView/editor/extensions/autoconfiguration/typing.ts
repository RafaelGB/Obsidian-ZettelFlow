export type Completion = {
    label: string;
    type: string;
    info: string;
    detail: string;
    boost: number;
    render?: (completion: Completion) => string;
};
export type CompletionLeaf = Completion | Completion[];

export type CompletionNode = Record<string, CompletionLeaf>;

export type CompletionTree = {
    [key: string]: CompletionNode | CompletionLeaf;
};