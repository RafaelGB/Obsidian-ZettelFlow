export type SelectableSearchType = {
    options: string[],
    onChange: (selections: string[]) => void
    autoFocus?: boolean,
    initialSelections?: string[],
    placeholder?: string,
    enableCreate?: boolean,
    disabled?: boolean
}