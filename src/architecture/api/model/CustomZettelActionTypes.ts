import { ContentDTO, FinalElement, NoteDTO } from "notes"

export type ExecuteInfo = {
    element: FinalElement,
    content: ContentDTO,
    note: NoteDTO,
    path: string
}