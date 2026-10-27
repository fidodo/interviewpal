import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { python } from "@codemirror/lang-python";

interface PythonEditorProps {
  initialCode: string;
  onChange: (code: string) => void;
  labelledBy?: string;
}

const theme = EditorView.theme({
  "&": { fontSize: "17px", backgroundColor: "#ffffff", color: "#14161f", borderRadius: "12px" },
  ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", padding: "12px 0", caretColor: "#14161f" },
  ".cm-gutters": { backgroundColor: "#f7f8fa", color: "#5d6273", border: "none", borderRadius: "12px 0 0 12px" },
  ".cm-activeLine": { backgroundColor: "#eef0ff" },
  ".cm-activeLineGutter": { backgroundColor: "#e0e3ff" },
  "&.cm-focused": { outline: "none" },
});

// The document is uncontrolled after mount: `initialCode` seeds it, and remounting (via `key`) resets it.
export function PythonEditor({ initialCode, onChange, labelledBy }: PythonEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: initialCode,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        // Tab indents (Python needs it); Esc then Tab still moves focus out of the editor.
        keymap.of([indentWithTab]),
        python(),
        indentUnit.of("    "),
        theme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": "Python code" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    onChangeRef.current(initialCode);
    return () => view.destroy();
  }, []);

  return <div ref={hostRef} className="python-editor" />;
}
