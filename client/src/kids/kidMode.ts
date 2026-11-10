// "Kid mode" locks this browser to one learner until a grown-up enters the PIN.
// It's a convenience lock for a family device, not a security boundary — the API is the parent's account either way.

const key = (userId: string) => `kids-lock:${userId}`;

export function getKidLock(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function setKidLock(userId: string, childId: string) {
  try {
    localStorage.setItem(key(userId), childId);
  } catch {
    // Storage blocked: kid mode just won't persist across reloads.
  }
}

export function clearKidLock(userId: string) {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    // Nothing stored, nothing to clear.
  }
}

export function kidHomePath(childId: string) {
  return `/kids/learn/${childId}`;
}

// Before turning on kid mode without a PIN: the child could leave it and reach the grown-up's account. Shared by the
// learner picker and "Start learning". True to carry on.
export function confirmNoPin(hasPin: boolean) {
  return hasPin || window.confirm("You haven't set a kid-mode PIN yet, so your child could leave kid mode and reach your account. Start anyway?");
}

// Whether kid mode has been started in this browser, for the Grown-ups "Getting started" checklist.
const startedKey = (userId: string) => `kids-started:${userId}`;
export function markKidsStarted(userId: string) {
  try {
    localStorage.setItem(startedKey(userId), "1");
  } catch {
    // Not remembered; the checklist just won't tick.
  }
}
export function kidsStarted(userId: string) {
  try {
    return localStorage.getItem(startedKey(userId)) === "1";
  } catch {
    return false;
  }
}
