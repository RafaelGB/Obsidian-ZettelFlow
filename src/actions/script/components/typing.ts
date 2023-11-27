import { FinalElement } from "application/notes"
import { Action } from "architecture/api"
import { Root } from "react-dom/client"

export type EditorWrapperProps = {
    action: Action,
    root: Root
}

export type CodeEditorProps = {
    code: string,
    onChange: (code: string) => Promise<void>
}

export type CodeElement = {
    code: string,
} & FinalElement;