import { TourStep } from "../components/OnboardingTour";

// "How to play" tours for children, in short, friendly sentences. Each opens by itself the first time a child sees
// the page (remembered per child in this browser) and can be replayed from the page's "How to play" button.
// Targets are data-tour attributes on the kids pages; a step whose target isn't on the page is skipped.

export const MAP_TOUR: TourStep[] = [
  { target: '[data-tour="kids-here"]', title: "This is your path", body: "Each stop on the path is a level, and this is the one you're on. Finish it to unlock the next one 🔒." },
  { target: '[data-tour="kids-play"]', title: "Press Play", body: "Pal, your coding helper, makes you a challenge to solve." },
  { target: '[data-tour="kids-progress"]', title: "Three to move up", body: "Finish 3 challenges to move up a level. You get up to 3 stars ⭐ for each one." },
  {
    target: '[data-tour="kids-badge"]',
    title: "Blocks first, then Python",
    body: "Levels 1 to 4 use blocks you snap together. From level 5 you type real Python code, like real programmers!",
  },
];

export function challengeTour(isBlocks: boolean): TourStep[] {
  return [
    { target: '[data-tour="kids-brief"]', title: "Read your challenge", body: "The story tells you what to make. Read it first, or ask a grown-up to read it with you." },
    {
      target: '[data-tour="kids-editor"]',
      title: isBlocks ? "Build it here" : "Write your code here",
      body: isBlocks
        ? "Drag blocks from the list and snap them together. \"Peek at the Python\" shows the real code your blocks make."
        : "Type your Python here. \"Start over\" clears it if you want a fresh go.",
    },
    ...(isBlocks
      ? []
      : [{ target: '[data-tour="kids-answers"]', title: "Answers for questions", body: "If your program asks a question with input(), it reads the answers from this box, one line each." }]),
    { target: '[data-tour="kids-run"]', title: "▶ Run to try it", body: "Run your program as many times as you like. You'll see what it draws or prints. Mistakes are fine!" },
    { target: '[data-tour="kids-check"]', title: "Check it when you're happy", body: "Press \"I'm done, check it!\" and Pal looks at your work, gives you stars and a tip." },
    { target: '[data-tour="kids-pal"]', title: "Stuck? Ask Pal", body: "Pal gives you hints, not the answer, so you still get to solve it yourself." },
  ];
}

const seenKey = (childId: string, page: "map" | "challenge") => `kids-tour:${childId}:${page}`;

export function tourSeen(childId: string, page: "map" | "challenge") {
  try {
    return localStorage.getItem(seenKey(childId, page)) === "1";
  } catch {
    // Can't remember: don't open it every time.
    return true;
  }
}

export function markTourSeen(childId: string, page: "map" | "challenge") {
  try {
    localStorage.setItem(seenKey(childId, page), "1");
  } catch {
    // Not remembered; it may open again next time.
  }
}
