export type SelectType ={
    options: Option[];
    callback: (value: string) => void;
}

export type Option = {
    key: string;
    label: string;
}

export type OptionElementType = {
    key: string;
    label: string;
    index: number;
}