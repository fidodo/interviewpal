import { useEffect, useRef } from "react";

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (parent: HTMLElement, options: { theme: string; size: string; text?: string; width?: number }) => void;
    };
  };
}

// Renders Google's button to re-confirm a Google-only account (no password to type) and hands back the ID token.
export function GoogleConfirmButton({ onCredential }: { onCredential: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const google = (window as unknown as { google?: GoogleIdentityServices }).google;

  useEffect(() => {
    if (!clientId || !google || !ref.current) return;
    google.accounts.id.initialize({ client_id: clientId, callback: (res) => callbackRef.current(res.credential) });
    google.accounts.id.renderButton(ref.current, { theme: "outline", size: "large", text: "continue_with", width: 260 });
  }, [clientId, google]);

  if (!clientId || !google) return <p className="error-text">Google sign-in didn't load. Refresh the page and try again.</p>;
  return <div ref={ref} />;
}
