import { Action } from "architecture/api"
import { Root } from "react-dom/client"

export type EditorWrapperProps = {
    action: Action,
    root: Root
}