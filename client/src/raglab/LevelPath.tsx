import { useEffect, useState } from "react";
import { raglabApi } from "../api/raglab";
import { LabLevel, LevelsResponse } from "./types";

import { errorMessage } from "./ragLabUtils";

// The levels, and the path of levels shown on both pages.
export function useLevels() {
  const [levels, setLevels] = useState<LevelsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    raglabApi
      .levels()
      .then(setLevels)
      .catch((err) => setError(errorMessage(err, "Couldn't load the levels")));
  }, []);
  return { levels, error };
}

export function LevelPath({ levels, current, selected, onSelect }: { levels: LabLevel[]; current?: number; selected?: number; onSelect?: (n: number) => void }) {
  return (
    <ol className="rl-path">
      {levels.map((l) => {
        const state = !l.playable ? "soon" : current == null ? "open" : l.number < current ? "passed" : l.number === current ? "current" : "locked";
        const label = { soon: "Coming soon", open: "", passed: "Passed", current: "Current level", locked: "Locked" }[state];
        const body = (
          <>
            <span className="rl-path-num" aria-hidden="true">
              {state === "passed" ? "✓" : l.number}
            </span>
            <span className="rl-path-text">
              <span className="rl-path-title">
                {l.number}. {l.title}
              </span>
              <span className="helper-text">
                {l.seniority}
                {label ? ` · ${label}` : ""}
              </span>
            </span>
          </>
        );
        const clickable = onSelect && l.playable && current != null && l.number <= current;
        return (
          <li key={l.number} className={`rl-path-item is-${state} ${selected === l.number ? "is-selected" : ""}`}>
            {clickable ? (
              <button type="button" className="rl-path-btn" aria-pressed={selected === l.number} onClick={() => onSelect!(l.number)}>
                {body}
              </button>
            ) : (
              <div className="rl-path-btn" title={l.summary}>
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
