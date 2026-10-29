import { useEffect, useRef } from "react";
import { Blockly, buildToolbox, workspaceToPython } from "./blocks";

interface BlocksEditorProps {
  toolbox: string[];
  // Where to keep the learner's blocks between visits (localStorage). Remount with a cleared key to start over.
  storageKey: string;
  onCodeChange: (code: string) => void;
}

function load(key: string) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function save(key: string, state: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage full or blocked: the blocks still work, they just won't be remembered.
  }
}

export function BlocksEditor({ toolbox, storageKey, onCodeChange }: BlocksEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCodeChangeRef = useRef(onCodeChange);
  onCodeChangeRef.current = onCodeChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const workspace = Blockly.inject(host, {
      toolbox: buildToolbox(toolbox),
      renderer: "zelos",
      // Serve Blockly's icons ourselves instead of from Google's demo server (keeps the CSP same-origin).
      media: "/blockly-media/",
      trashcan: true,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: false },
      zoom: { controls: true, startScale: 0.85, maxScale: 2, minScale: 0.4 },
      grid: { spacing: 24, length: 2, colour: "#e7e9ee", snap: true },
    });

    const saved = load(storageKey);
    if (saved) {
      try {
        Blockly.serialization.workspaces.load(saved, workspace);
      } catch {
        workspace.clear();
      }
    }
    onCodeChangeRef.current(workspaceToPython(workspace));

    const listener = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      save(storageKey, Blockly.serialization.workspaces.save(workspace));
      onCodeChangeRef.current(workspaceToPython(workspace));
    };
    workspace.addChangeListener(listener);

    const resize = new ResizeObserver(() => Blockly.svgResize(workspace));
    resize.observe(host);

    return () => {
      resize.disconnect();
      workspace.dispose();
    };
    // Compare the toolbox by content so a re-fetched (but identical) level doesn't rebuild the workspace.
  }, [toolbox.join(","), storageKey]);

  return (
    <div className="blocks-editor">
      <p className="visually-hidden">
        Block editor. Drag blocks from the categories on the left into the workspace and snap them together. The Python they make is
        shown with "Peek at the Python".
      </p>
      <div ref={hostRef} className="blocks-host" />
    </div>
  );
}
