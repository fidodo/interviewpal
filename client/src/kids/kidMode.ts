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
