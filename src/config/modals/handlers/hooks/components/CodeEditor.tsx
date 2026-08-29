import React, { useEffect, useRef, useState } from "react";
import { c, log } from "architecture";
import { EditorView } from "codemirror";
import { dispatchEditor } from "architecture/components/core";
import { hookAutocomplete } from "../extensions/autoconfiguration/HookAutocomplete";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * A CodeMirror editor for a hook script. Its initialization is wrapped defensively (#327 hardening): if
 * CodeMirror ever fails to mount, we log it and fall back to a plain textarea instead of letting the throw
 * propagate and unmount the entire hooks settings tree.
 */
export const CodeEditor = ({ value, onChange }: CodeEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!editorRef.current || failed) return;

    try {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      const view = dispatchEditor(
        editorRef.current,
        value,
        (update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        },
        [hookAutocomplete]
      );
      viewRef.current = view;
    } catch (error) {
      log.error("[PropertyHooks] CodeMirror failed to initialize; falling back to a textarea", error);
      setFailed(true);
    }

    return () => {
      try {
        viewRef.current?.destroy();
      } catch (error) {
        log.warn("[PropertyHooks] error disposing the hook editor", error);
      }
      viewRef.current = null;
    };
  }, [failed]);

  // Keep the editor content in sync when the value prop changes externally.
  useEffect(() => {
    const view = viewRef.current;
    if (view && value !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  if (failed) {
    return (
      <textarea
        className={c("property-hook-text-input", "property-hook-script-fallback")}
        value={value}
        spellCheck={false}
        rows={8}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return <div className={c("code-editor-container")} ref={editorRef} />;
};
