import { ContentDTO, FinalElement } from "notes"

export type ExecuteInfo = {
    element: FinalElement,
    content: ContentDTO,
    path: string
}