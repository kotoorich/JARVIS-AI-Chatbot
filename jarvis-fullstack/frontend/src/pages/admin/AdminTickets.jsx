import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { LifeBuoy, Loader2, CheckCircle2, Clock, AlertCircle, X } from 'lucide-react';
import { formatWhen } from '@/lib/activity';
import api from '@/api/Client';

const STATUS_TABS = [
  { v: 'open', label: 'Open', Icon: AlertCircle, tone: 'text-amber-500' },
  { v: 'in_progress', label: 'In progress', Icon: Clock, tone: 'text-blue-500' },
  { v: 'resolved', label: 'Resolved', Icon: CheckCircle2, tone: 'text-emerald-500' },
  { v: 'closed', label: 'Closed', Icon: X, tone: 'text-slate-500' },
  { v: 'all', label: 'All', Icon: LifeBuoy, tone: 'text-muted-foreground' },
];

const PRIORITY_TONE = {
  low: 'text-slate-500',
  normal: 'text-slate-400',
  high: 'text-amber-500',
  urgent: 'text-red-500',
};

export default function AdminTickets() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin', 'tickets', { status }],
    queryFn: async () => {
      const qs = status !== 'all' ? `?status=${status}` : '';
      return (await api.get(`/api/admin/tickets${qs}`)).data;
    },
    refetchInterval: 20000,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Support tickets</h1>
        <p className="text-sm text-muted-foreground">
          {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'} shown.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 mb-4 bg-muted rounded-lg p-1 text-xs w-fit">
        {STATUS_TABS.map((tab) => {
          const active = status === tab.v;
          return (
            <button
              key={tab.v}
              onClick={() => setParams(tab.v === 'all' ? {} : { status: tab.v })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition ${
                active ? 'bg-background shadow-sm font-medium' : 'opacity-70'
              }`}
            >
              <tab.Icon className={`h-3 w-3 ${active ? tab.tone : ''}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading tickets…
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No tickets {status !== 'all' && `with status “${status}”`}.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {tickets.map((t) => <TicketRow key={t.id} t={t} />)}
        </div>
      )}
    </div>
  );
}

function TicketRow({ t }) {
  const statusMeta = STATUS_TABS.find((s) => s.v === t.status) || STATUS_TABS[0];
  return (
    <Link
      to={`/admin/tickets/${t.id}`}
      className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/30 transition-colors"
    >
      <statusMeta.Icon className={`h-4 w-4 shrink-0 ${statusMeta.tone}`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{t.subject}</p>
        <p className="text-xs text-muted-foreground">
          #{t.id} · updated {formatWhen(t.updated_at)}
        </p>
      </div>
      <span className={`text-[11px] uppercase tracking-wider hidden sm:inline ${PRIORITY_TONE[t.priority] || ''}`}>
        {t.priority}
      </span>
    </Link>
  );
}
