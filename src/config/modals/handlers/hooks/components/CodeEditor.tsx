import React, { useEffect, useRef } from "react";
import { c } from "architecture";
import { EditorView } from "codemirror";
import { dispatchEditor } from "architecture/components/core";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const CodeEditor = ({ value, onChange }: CodeEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Clean up previous editor instance if it exists
    if (viewRef.current) {
      viewRef.current.destroy();
    }
    const view = dispatchEditor(editorRef.current, value, (update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [editorRef]);

  // Update editor content if value prop changes
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return <div className={c("code-editor-container")} ref={editorRef} />;
};
