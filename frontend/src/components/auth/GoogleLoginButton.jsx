import React, { useEffect, useRef } from "react";
import { useGoogleOAuth } from "@react-oauth/google";

/**
 * Google Identity Services button wrapper.
 * Waits for GIS script (injected by GoogleOAuthProvider) before initialize/renderButton.
 */
export default function GoogleLoginButton({
  clientId,
  onSuccess,
  onError,
  width = 300,
}) {
  const { scriptLoadedSuccessfully, clientId: providerClientId } =
    useGoogleOAuth();
  const buttonRef = useRef(null);
  const initializedRef = useRef(false);

  const effectiveClientId = clientId || providerClientId;

  useEffect(() => {
    if (!effectiveClientId) {
      onError?.(
        new Error(
          "Missing VITE_GOOGLE_CLIENT_ID. Set it in frontend/.env and restart the Vite dev server.",
        ),
      );
      return;
    }

    if (!scriptLoadedSuccessfully) {
      return;
    }

    if (initializedRef.current) return;

    const googleObj = window.google;
    if (!googleObj?.accounts?.id) {
      onError?.(
        new Error(
          "Google Identity Services not available after script load. Try again or check network.",
        ),
      );
      return;
    }

    initializedRef.current = true;

    googleObj.accounts.id.initialize({
      client_id: effectiveClientId,
      callback: (resp) => onSuccess?.(resp),
      use_one_tap: false,
    });

    const el = buttonRef.current;
    if (el) {
      el.innerHTML = "";
      googleObj.accounts.id.renderButton(el, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width,
      });
    }
  }, [
    effectiveClientId,
    onSuccess,
    onError,
    width,
    scriptLoadedSuccessfully,
  ]);

  return (
    <div
      ref={buttonRef}
      className="min-h-[40px] flex items-center justify-center"
      aria-busy={!scriptLoadedSuccessfully}
    />
  );
}
