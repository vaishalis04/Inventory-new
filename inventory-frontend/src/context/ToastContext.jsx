import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Toast notifications.
 *
 *   const toast = useToast();
 *   toast.success("Saved.");
 *   toast.error("Something went wrong.");
 *   toast.info("FYI");
 *
 * DURATION = how long each kind stays on screen (milliseconds).
 * 0 means "stay until the page clears it or the user closes it".
 *
 * Error toasts are left at 0 on purpose: pages show an error until the user
 * fixes the problem / tries again, and a toast that disappears by itself would
 * hide a repeated error (e.g. pressing Save twice with the same missing field).
 * If you prefer errors to vanish by themselves, change `error: 0` to e.g. 7000.
 */
export const DURATION = { success: 4000, info: 4000, error: 0 };

const MAX_VISIBLE = 4;
const ICONS = { success: "\u2713", error: "!", info: "i" };

const noop = () => null;
const FALLBACK = { show: noop, success: noop, error: noop, info: noop, dismiss: noop };

const ToastContext = createContext(FALLBACK);
let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const listRef = useRef([]); // always the latest list (avoids stale state in callbacks)
  const timers = useRef(new Map());

  const commit = useCallback((next) => {
    listRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback(
    (id) => {
      if (id == null) return;
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      commit(listRef.current.filter((t) => t.id !== id));
    },
    [commit]
  );

  const arm = useCallback(
    (id, ms) => {
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [dismiss]
  );

  const show = useCallback(
    (type, message, options = {}) => {
      const text = String(message ?? "").trim();
      if (!text) return null;
      const duration = options.duration ?? DURATION[type] ?? 0;

      // Same message already on screen: don't stack a duplicate, just keep it visible.
      const same = listRef.current.find((t) => t.type === type && t.message === text);
      if (same) {
        arm(same.id, duration);
        return same.id;
      }

      const id = ++counter;
      let next = [...listRef.current, { id, type, message: text, action: options.action }];
      while (next.length > MAX_VISIBLE) {
        const [oldest, ...rest] = next;
        clearTimeout(timers.current.get(oldest.id));
        timers.current.delete(oldest.id);
        next = rest;
      }
      commit(next);
      arm(id, duration);
      return id;
    },
    [arm, commit]
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show("success", message, options),
      error: (message, options) => show("error", message, options),
      info: (message, options) => show("info", message, options),
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type}`}
            role={t.type === "error" ? "alert" : "status"}
          >
            <span className="toast-icon" aria-hidden="true">{ICONS[t.type]}</span>
            <span className="toast-message">{t.message}</span>
            {t.action && (
              <button type="button" className="toast-action" onClick={t.action.onClick}>
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              aria-label="Close notification"
              onClick={() => dismiss(t.id)}
            >
              {"\u00d7"}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);