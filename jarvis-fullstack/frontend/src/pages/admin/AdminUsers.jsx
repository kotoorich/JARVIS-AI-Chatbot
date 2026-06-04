import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, ShieldAlert, Lock, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import UserAvatar from '@/components/UserAvatar';
import api from '@/api/Client';
import { formatWhen } from '@/lib/activity';

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const debounced = useDebounced(search.trim(), 250);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users', { q: debounced, role }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debounced) params.set('q', debounced);
      if (role !== 'all') params.set('role', role);
      return (await api.get(`/api/admin/users?${params.toString()}`)).data;
    },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">{users.length} {users.length === 1 ? 'account' : 'accounts'} shown.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email, name, or username…"
            className="pl-9 pr-8"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1 text-xs">
          {[
            { v: 'all', label: 'All' },
            { v: 'user', label: 'Users' },
            { v: 'admin', label: 'Admins' },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setRole(opt.v)}
              className={`px-3 py-1.5 rounded-md transition ${
                role === opt.v ? 'bg-background shadow-sm font-medium' : 'opacity-70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading users…
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          No users match those filters.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">User</th>
                  <th className="text-left font-medium px-4 py-2">Role</th>
                  <th className="text-left font-medium px-4 py-2">Last login</th>
                  <th className="text-left font-medium px-4 py-2">Chats</th>
                  <th className="text-left font-medium px-4 py-2">Tickets</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => navigate(`/admin/users/${u.id}`)}
                    className="cursor-pointer hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar user={u} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{u.full_name || u.username || '—'}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          <ShieldAlert className="h-3 w-3" /> admin
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">user</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{u.last_login_at ? formatWhen(u.last_login_at) : 'never'}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{u.conversation_count}</td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{u.ticket_count}</td>
                    <td className="px-4 py-2.5">
                      {u.is_locked ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                          <Lock className="h-3 w-3" /> locked
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => navigate(`/admin/users/${u.id}`)}
                className="w-full text-left rounded-xl border border-border bg-card p-3 flex items-center gap-3 hover:border-foreground/20"
              >
                <UserAvatar user={u} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.full_name || u.username || u.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {u.role === 'admin' && <span className="text-purple-500 mr-2">admin</span>}
                    {u.is_locked && <span className="text-red-500 mr-2">locked</span>}
                    {u.conversation_count} chats · {u.ticket_count} tickets
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
