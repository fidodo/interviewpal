import { useEffect, useState } from "react";
import { api } from "../api/client";

let cached: Promise<{ emailEnabled: boolean }> | null = null;

// Whether the server has email (verification, password reset) switched on. Fetched once per page load.
export function useAuthConfig() {
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    cached ??= api.get<{ emailEnabled: boolean }>("/auth/config").catch(() => ({ emailEnabled: false }));
    cached.then((c) => setEmailEnabled(c.emailEnabled));
  }, []);
  return { emailEnabled };
}
