import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users, ShieldAlert, MessagesSquare, LifeBuoy, Activity,
  Lock, AlertTriangle, CheckCircle2, Loader2, TrendingUp,
} from 'lucide-react';
import api from '@/api/Client';
import { describeEvent, formatWhen } from '@/lib/activity';

export default function AdminDashboard() {
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get('/api/admin/stats')).data,
    refetchInterval: 30000,
  });

  const { data: recent = [], isLoading: loadingRecent } = useQuery({
    queryKey: ['admin', 'activity', 'recent'],
    queryFn: async () => (await api.get('/api/admin/activity?limit=15')).data,
    refetchInterval: 15000,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">A live look at user, support, and security activity.</p>
      </div>

      {/* Stat tiles */}
      {loadingStats ? (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total users" value={stats.total_users} icon={Users} accent="text-cyan-500" sub={`+${stats.new_users_24h} in last 24h`} />
          <StatTile label="Admins" value={stats.admin_users} icon={ShieldAlert} accent="text-purple-500" />
          <StatTile label="Locked accounts" value={stats.locked_users} icon={Lock} accent={stats.locked_users ? 'text-amber-500' : 'text-slate-500'} />
          <StatTile label="Failed logins (24h)" value={stats.failed_logins_24h} icon={AlertTriangle} accent={stats.failed_logins_24h > 5 ? 'text-red-500' : 'text-slate-500'} />
          <StatTile label="Conversations" value={stats.total_conversations} icon={MessagesSquare} accent="text-cyan-500" />
          <StatTile label="Open tickets" value={stats.open_tickets} icon={LifeBuoy} accent={stats.open_tickets ? 'text-amber-500' : 'text-emerald-500'} link="/admin/tickets?status=open" />
          <StatTile label="In progress" value={stats.in_progress_tickets} icon={TrendingUp} accent="text-blue-500" link="/admin/tickets?status=in_progress" />
          <StatTile label="Resolved" value={stats.resolved_tickets} icon={CheckCircle2} accent="text-emerald-500" link="/admin/tickets?status=resolved" />
        </div>
      )}

      {/* Recent activity */}
      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent activity
          </h2>
          <Link to="/admin/activity" className="text-xs text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </div>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {loadingRecent && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> Loading…
            </div>
          )}
          {!loadingRecent && recent.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No activity yet.</div>
          )}
          {recent.map((e) => <ActivityRow key={e.id} event={e} />)}
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent = 'text-slate-500', sub, link }) {
  const inner = (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2 transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
  return link ? <Link to={link} className="block">{inner}</Link> : inner;
}

function ActivityRow({ event }) {
  const { label, Icon, tone } = describeEvent(event.event_type);
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-[11px] text-muted-foreground">{formatWhen(event.created_at)}</span>
        </div>
        {event.description && (
          <p className="text-xs text-muted-foreground truncate">{event.description}</p>
        )}
      </div>
      {event.ip && <span className="text-[10px] text-muted-foreground hidden sm:inline tabular-nums">{event.ip}</span>}
    </div>
  );
}
