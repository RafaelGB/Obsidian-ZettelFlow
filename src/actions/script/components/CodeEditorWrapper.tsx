import React, { useEffect, useState } from "react";

import { CodeEditorProps, CodeElement, EditorWrapperProps } from "./typing";
import { c } from "architecture";
export function CodeEditorWrapper(props: EditorWrapperProps) {
  const action = props.action as CodeElement;
  const { code } = action;
  useEffect(() => {
    return () => {
      props.root.unmount();
    };
  }, []);

  return (
    <div className={c("code-editor-wrapper")}>
      {/* Reset all the textArea styles */}
      <CodeEditor
        code={code}
        onChange={async (code) => {
          action.code = code;
        }}
      />
    </div>
  );
}

function CodeEditor(props: CodeEditorProps) {
  const { code, onChange } = props;
  const [codeState, setCodeState] = useState(code);

  return (
    <textarea
      className={c("code-editor")}
      value={codeState}
      onChange={async (e) => {
        const value = e.target.value;
        setCodeState(value);
        await onChange(value);
      }}
    >
      {codeState}
    </textarea>
  );
}
