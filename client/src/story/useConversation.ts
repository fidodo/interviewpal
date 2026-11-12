import { useCallback, useEffect, useState } from "react";
import { storyApi } from "../api/story";
import { Story, Turn } from "./types";

// "Read their replies aloud", remembered per browser.
const READ_ALOUD_KEY = "speak-read-aloud";

export function speakAloud(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function savedReadAloud() {
  try {
    return localStorage.getItem(READ_ALOUD_KEY) === "1";
  } catch {
    return false;
  }
}

// A Speak conversation in progress: your lines and the other person's replies, kept in the browser until the take is
// submitted (the server is stateless between turns). Inert for stories that aren't conversations.
export function useConversation(story: Story | null) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [replying, setReplying] = useState(false);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [readAloud, setReadAloudState] = useState(savedReadAloud);

  // Read-aloud stops when you leave the page.
  useEffect(() => stopSpeaking, []);

  const maxTurns = story?.conversation?.maxTurns ?? 0;
  const yourTurns = turns.filter((t) => t.role === "you").length;
  const over = !!story?.conversation && (turnsLeft === 0 || yourTurns >= maxTurns);

  // Sends your line and resolves with their reply. On failure the line is taken back off and the error is rethrown,
  // so the page can put your words back in the box.
  async function send(text: string) {
    if (!story) throw new Error("No story");
    const before = turns;
    const next: Turn[] = [...turns, { role: "you", text }];
    setTurns(next);
    setReplying(true);
    try {
      const res = await storyApi.reply(story.id, next);
      setTurns([...next, { role: "them", text: res.reply }]);
      setTurnsLeft(res.turnsLeft);
      if (readAloud) speakAloud(res.reply);
      return res.reply;
    } catch (err) {
      setTurns(before);
      throw err;
    } finally {
      setReplying(false);
    }
  }

  // The turns to submit: a last line you haven't sent for a reply is included, unless every turn is used (the
  // server would refuse it).
  function turnsToSubmit(pending: string): Turn[] {
    return pending && yourTurns < maxTurns ? [...turns, { role: "you", text: pending }] : turns;
  }

  const reset = useCallback(() => {
    stopSpeaking();
    setTurns([]);
    setTurnsLeft(null);
  }, []);

  function setReadAloud(on: boolean) {
    setReadAloudState(on);
    if (!on) stopSpeaking();
    try {
      localStorage.setItem(READ_ALOUD_KEY, on ? "1" : "0");
    } catch {
      // Not remembered.
    }
  }

  return { turns, replying, readAloud, setReadAloud, yourTurns, over, send, turnsToSubmit, reset };
}
