export type OptionItemProps = {
    frontmatter: string,
    isDefault: boolean,
    label: string,
    index: number,
    deleteOptionCallback: (index: number) => void,
    updateOptionInfoCallback: (index: number, frontmatter: string, label: string) => void,
    changeDefaultCallback: (key: string) => void,
}