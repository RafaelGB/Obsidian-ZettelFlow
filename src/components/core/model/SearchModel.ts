export type SearchType = {
    onChange: (value: string) => void;
    options: Record<string, string>;
    placeholder?: string;
};