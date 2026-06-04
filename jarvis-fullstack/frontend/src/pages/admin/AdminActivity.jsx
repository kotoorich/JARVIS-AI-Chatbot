import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Filter } from 'lucide-react';
import api from '@/api/Client';
import { describeEvent, formatWhen } from '@/lib/activity';

const FILTERS = [
  { v: '', label: 'All' },
  { v: 'login_success', label: 'Sign-ins' },
  { v: 'login_failed', label: 'Failed sign-ins' },
  { v: 'account_locked', label: 'Lockouts' },
  { v: 'register', label: 'Registrations' },
  { v: 'password_changed', label: 'Password changes' },
  { v: 'admin_user_updated', label: 'Admin: user updates' },
  { v: 'admin_user_deleted', label: 'Admin: user deletions' },
];

export default function AdminActivity() {
  const [filter, setFilter] = useState('');

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['admin', 'activity', { event_type: filter }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' });
      if (filter) params.set('event_type', filter);
      return (await api.get(`/api/admin/activity?${params.toString()}`)).data;
    },
    refetchInterval: 15000,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">Security and audit events across the system.</p>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {FILTERS.map((f) => (
          <button
            key={f.v}
            onClick={() => setFilter(f.v)}
            className={`text-xs px-2.5 py-1 rounded-md border transition ${
              filter === f.v ? 'border-foreground/40 bg-muted font-medium' : 'border-border hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No matching activity.
        </div>
      ) : (
        <ul className="rounded-xl border border-border bg-card divide-y divide-border">
          {events.map((e) => {
            const { label, Icon, tone } = describeEvent(e.event_type);
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{formatWhen(e.created_at)}</span>
                  </div>
                  {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {e.user_id && <span>user #{e.user_id}</span>}
                    {e.actor_id && e.actor_id !== e.user_id && <span> · by admin #{e.actor_id}</span>}
                    {e.ip && <span> · {e.ip}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
