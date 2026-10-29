import { ReactNode } from "react";

// Renders the small text format lessons are written in: "## " subheadings, "- " bullets, ``` code blocks and
// plain paragraphs. Everything becomes React text nodes, so nothing the AI writes is ever treated as HTML.
export function LessonContent({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push(<p key={blocks.length}>{paragraph.join(" ")}</p>);
      paragraph = [];
    }
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length}>
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      blocks.push(
        // Focusable so keyboard users can scroll wide code sideways.
        <pre key={blocks.length} className="lesson-code" tabIndex={0}>
          <code>{code.join("\n")}</code>
        </pre>
      );
    } else if (/^#{1,6}\s/.test(trimmed)) {
      flush();
      blocks.push(<h3 key={blocks.length}>{trimmed.replace(/^#+\s+/, "")}</h3>);
    } else if (/^[-*]\s+/.test(trimmed)) {
      if (paragraph.length) flush();
      bullets.push(trimmed.replace(/^[-*]\s+/, ""));
    } else if (trimmed === "") {
      flush();
    } else {
      if (bullets.length) flush();
      paragraph.push(trimmed);
    }
  }
  flush();
  return <div className="lesson-content">{blocks}</div>;
}
