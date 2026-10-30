import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { HighlightStyle, defaultHighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";

interface CodeEditorProps {
  initialCode: string;
  onChange: (code: string) => void;
  // Syntax highlighting for Python and JavaScript/TypeScript/JSX; other stacks are edited as plain text.
  language: string;
  labelledBy: string;
}

const theme = EditorView.theme({
  "&": { fontSize: "15px", backgroundColor: "#ffffff", color: "#14161f", borderRadius: "10px" },
  ".cm-content": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", padding: "10px 0", caretColor: "#14161f" },
  ".cm-gutters": { backgroundColor: "#f7f8fa", color: "#5d6273", border: "none", borderRadius: "10px 0 0 10px" },
  ".cm-activeLine": { backgroundColor: "#eef0ff" },
  ".cm-activeLineGutter": { backgroundColor: "#e0e3ff" },
  "&.cm-focused": { outline: "none" },
});

// CodeMirror's default highlight style, with the two colours that are under 4.5:1 on white darkened: escapes and
// regexes (#e40) and invalid code (#f00). A non-fallback style replaces basicSetup's default entirely.
const DARKER: Record<string, string> = { "#e40": "#b03000", "#f00": "#c00000" };
const highlighting = syntaxHighlighting(
  HighlightStyle.define(defaultHighlightStyle.specs.map((spec) => (spec.color && DARKER[spec.color] ? { ...spec, color: DARKER[spec.color] } : spec)))
);

function languageSupport(language: string) {
  if (language === "python") return [python()];
  if (language === "javascript" || language === "react") return [javascript({ jsx: true })];
  if (language === "typescript") return [javascript({ typescript: true })];
  return [];
}

// Uncontrolled after mount: `initialCode` seeds it, and remounting (via `key`) resets it.
export function CodeEditor({ initialCode, onChange, language, labelledBy }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: initialCode,
      parent: hostRef.current,
      extensions: [
        highlighting,
        basicSetup,
        // Tab indents; Esc then Tab still moves focus out of the editor.
        keymap.of([indentWithTab]),
        ...languageSupport(language),
        indentUnit.of(language === "python" ? "    " : "  "),
        theme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-labelledby": labelledBy }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    onChangeRef.current(initialCode);
    return () => view.destroy();
    // Recreated only when the language changes; new starting code comes through a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return <div ref={hostRef} className="code-editor" />;
}
