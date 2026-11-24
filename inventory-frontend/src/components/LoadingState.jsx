import { useEffect, useRef } from "react";
import { useToast } from "../context/ToastContext";

export const Loading = ({ text = "Loading..." }) => <p className="muted">{text}</p>;

/**
 * Shows `error` as a toast. It stays while `error` is set (so the page controls
 * when it goes away, exactly like the old inline message) and can be closed
 * with the X. If an onRetry handler is given, the toast gets a Retry button.
 */
export function ErrorMessage({ error, onRetry }) {
  const toast = useToast();
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  const hasRetry = Boolean(onRetry);

  useEffect(() => {
    if (!error) return undefined;
    const id = toast.error(
      String(error),
      hasRetry ? { action: { label: "Retry", onClick: () => retryRef.current?.() } } : undefined
    );
    return () => toast.dismiss(id);
  }, [error, hasRetry, toast]);

  return null;
}

/** Shows plain-text children as a success toast that closes by itself. */
export function Success({ children }) {
  const toast = useToast();
  const text = typeof children === "string" ? children : "";

  useEffect(() => {
    if (text) toast.success(text);
  }, [text, toast]);

  // Non-text content can't go in a toast, so keep the original inline message for it.
  if (children && typeof children !== "string") return <p className="alert success">{children}</p>;
  return null;
}