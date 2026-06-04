/**
 * Re-implemented `toast()` and `useToast()` so that every call routes to
 * the backend notification list (the bell icon) instead of rendering an
 * on-screen popup.
 *
 * Same call signature as the old shadcn toast hook — `toast({ title,
 * description, variant })` — so existing call sites need no changes.
 *
 * `variant: 'destructive'` marks an error notification (event_type
 * `error`), anything else marks it as `info`.
 *
 * The hook also returns `toasts: []` (always empty) so the old
 * `<Toaster>` component, if it's still mounted somewhere, renders
 * nothing.
 */
import api from "@/api/Client";

// We need a way to invalidate the notification list query when a new
// notification is posted, so the bell updates immediately. We grab the
// QueryClient lazily from a module-level setter that the AuthProvider (or
// any other top-level component) can call once on mount.
let _queryClient = null;
export function setToastQueryClient(qc) {
  _queryClient = qc;
}

function _bumpNotifications() {
  try {
    _queryClient?.invalidateQueries({ queryKey: ["notifications"] });
  } catch {}
}

/**
 * Public API kept compatible with the old shadcn `toast({...})` call:
 *   - title:        short string shown as the notification title
 *   - description:  longer body text
 *   - variant:      'destructive' for errors; anything else is informational
 *
 * Failures here are silent: a failure to post a UI notification must NEVER
 * surface as another toast (infinite loop) or interrupt the user's flow.
 */
export function toast({ title, description, variant, link } = {}) {
  if (!title) return { id: null, dismiss: () => {}, update: () => {} };
  const event_type = variant === "destructive" ? "error" : "info";
  // Fire-and-forget. We deliberately don't await — UI shouldn't block on this.
  api
    .post("/api/notifications/self", {
      event_type,
      title: String(title).slice(0, 200),
      body: description ? String(description).slice(0, 500) : undefined,
      link: link || undefined,
    })
    .then(_bumpNotifications)
    .catch(() => {
      // Silent. Don't loop.
    });
  return { id: null, dismiss: () => {}, update: () => {} };
}

/**
 * Old hook shape preserved so the existing `<Toaster>` component still
 * works without changes — it just gets an empty array of toasts and
 * renders nothing.
 */
export function useToast() {
  return {
    toasts: [],
    toast,
    dismiss: () => {},
  };
}
