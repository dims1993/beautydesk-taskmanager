import React, { useEffect, useRef } from "react";

/**
 * Google Identity Services button wrapper.
 * Ensures `google.accounts.id.initialize` runs only once.
 */
export default function GoogleLoginButton({
  clientId,
  onSuccess,
  onError,
  width = 300,
}) {
  const buttonRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (!clientId) {
      onError?.(
        new Error(
          "Missing VITE_GOOGLE_CLIENT_ID. Set it in frontend/.env and restart the Vite dev server.",
        ),
      );
      return;
    }

    const googleObj = window.google;
    if (!googleObj?.accounts?.id) {
      onError?.(
        new Error(
          "Google Identity Services not loaded. Check GoogleOAuthProvider clientId and that the script can load.",
        ),
      );
      return;
    }

    initializedRef.current = true;

    googleObj.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => onSuccess?.(resp),
      use_one_tap: false,
    });

    if (buttonRef.current) {
      googleObj.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width,
      });
    }
  }, [clientId, onSuccess, onError, width]);

  return <div ref={buttonRef} />;
}

