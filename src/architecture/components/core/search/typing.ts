export type SearchType<T> = {
    onChange: (value: T | null) => void;
    options: Record<string, T>;
    placeholder?: string;
    className?: string;
};