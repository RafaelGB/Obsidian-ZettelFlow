export type SelectableSearchType = {
    options: string[],
    onChange: (selections: string[]) => void
    initialSelections?: string[],
    placeholder?: string,
}