import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, CheckCheck, Loader2, KeyRound, Mail, Shield, MessageSquare, Sparkles,
  X, Trash2, Info, AlertCircle,
} from 'lucide-react';
import api from '@/api/Client';

// Per-event icons & accent colors. Falls back to a generic Bell.
const EVENT_META = {
  welcome:          { Icon: Sparkles,       tone: 'cyan' },
  password_changed: { Icon: KeyRound,       tone: 'cyan' },
  email_changed:    { Icon: Mail,           tone: 'cyan' },
  email_verified:   { Icon: Mail,           tone: 'cyan' },
  role_changed:     { Icon: Shield,         tone: 'cyan' },
  ticket_reply:     { Icon: MessageSquare,  tone: 'cyan' },
  info:             { Icon: Info,           tone: 'cyan' },
  error:            { Icon: AlertCircle,    tone: 'red' },
};

/** Absolute timestamp formatter: "Jun 2, 2026 · 11:42 AM" */
function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const date = d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  });
  return `${date} · ${time}`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/api/notifications', { params: { limit: 50 } })).data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const items = data?.items || [];
  const unread = data?.unread_count || 0;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const markOne = useMutation({
    mutationFn: async (id) => api.post(`/api/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: async () => api.post('/api/notifications/read-all'),
    onSuccess: invalidate,
  });
  const deleteOne = useMutation({
    mutationFn: async (id) => api.delete(`/api/notifications/${id}`),
    // Optimistic: drop it from the cached list immediately
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData(['notifications']);
      if (prev) {
        const target = prev.items.find((n) => n.id === id);
        const wasUnread = target && !target.is_read;
        queryClient.setQueryData(['notifications'], {
          items: prev.items.filter((n) => n.id !== id),
          unread_count: Math.max(0, prev.unread_count - (wasUnread ? 1 : 0)),
        });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => ctx?.prev && queryClient.setQueryData(['notifications'], ctx.prev),
    onSettled: invalidate,
  });
  const clearAll = useMutation({
    mutationFn: async () => api.delete('/api/notifications'),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['notifications'] });
      const prev = queryClient.getQueryData(['notifications']);
      queryClient.setQueryData(['notifications'], { items: [], unread_count: 0 });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && queryClient.setQueryData(['notifications'], ctx.prev),
    onSettled: invalidate,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!wrapperRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleClick = (n) => {
    if (!n.is_read) markOne.mutate(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 hover:bg-muted rounded-lg transition-colors"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-background"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+4px)] w-80 sm:w-96 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border gap-2">
            <h3 className="font-semibold text-sm shrink-0">Notifications</h3>
            <div className="flex items-center gap-3 text-xs">
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Mark all as read"
                >
                  {markAll.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <CheckCheck className="h-3.5 w-3.5" />}
                  Mark all read
                </button>
              )}
              {items.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Delete all notifications? This cannot be undone.')) {
                      clearAll.mutate();
                    }
                  }}
                  disabled={clearAll.isPending}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-red-500 transition-colors"
                  title="Delete all notifications"
                >
                  {clearAll.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                You're all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const meta = EVENT_META[n.event_type] || { Icon: Bell, tone: 'cyan' };
                  const Icon = meta.Icon;
                  const isError = meta.tone === 'red';
                  return (
                    <li key={n.id} className={`group ${!n.is_read ? 'bg-cyan-500/5' : ''}`}>
                      <div className="flex items-start gap-3 px-4 py-3">
                        <button
                          onClick={() => handleClick(n)}
                          className="flex-1 min-w-0 text-left flex items-start gap-3"
                        >
                          <div className={`mt-0.5 shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${
                            isError
                              ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                              : (n.is_read
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400')
                          }`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-snug ${n.is_read ? 'font-normal' : 'font-semibold'}`}>
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="text-xs text-muted-foreground mt-0.5 break-words">
                                {n.body}
                              </p>
                            )}
                            <p className="text-[11px] text-muted-foreground/70 mt-1">
                              {formatTimestamp(n.created_at)}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteOne.mutate(n.id); }}
                          className="shrink-0 p-1 rounded-md text-muted-foreground/50 hover:text-red-500 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Delete notification"
                          title="Delete"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
