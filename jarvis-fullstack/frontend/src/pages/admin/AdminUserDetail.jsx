import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Lock, Unlock, ShieldAlert, ShieldOff, Trash2,
  Loader2, AlertTriangle, Mail, Calendar, MessagesSquare, LifeBuoy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import UserAvatar from '@/components/UserAvatar';
import { useAuth } from '@/lib/AuthContext';
import { describeEvent, formatWhen } from '@/lib/activity';
import { apiErrorMessage } from '@/lib/api-error';
import api from '@/api/Client';

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: u, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: async () => (await api.get(`/api/admin/users/${id}`)).data,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ['admin', 'users', id, 'activity'],
    queryFn: async () => (await api.get(`/api/admin/users/${id}/activity?limit=50`)).data,
    enabled: !!u,
  });

  const patchUser = useMutation({
    mutationFn: async (body) => (await api.patch(`/api/admin/users/${id}`, body)).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['admin', 'users', id], data);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', id, 'activity'] });
    },
    onError: (err) => toast({ title: 'Update failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const deleteUser = useMutation({
    mutationFn: async () => api.delete(`/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast({ title: 'User deleted' });
      navigate('/admin/users');
    },
    onError: (err) => toast({ title: 'Could not delete user', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading user…
      </div>
    );
  }
  if (!u) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        User not found. <Link to="/admin/users" className="underline">Back to users</Link>.
      </div>
    );
  }

  const isSelf = u.id === me?.id;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <button onClick={() => navigate('/admin/users')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> All users
      </button>

      {/* Header card */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row items-start gap-5">
          <UserAvatar user={u} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold">{u.full_name || u.username || u.email}</h1>
            <div className="mt-1 text-sm text-muted-foreground space-y-0.5">
              <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {u.email}</p>
              {u.username && <p>@{u.username}</p>}
              <p className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Joined {formatWhen(u.created_at)}
                {u.last_login_at && ` · last signed in ${formatWhen(u.last_login_at)}`}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {u.role === 'admin' && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <ShieldAlert className="h-3 w-3" /> admin
                </span>
              )}
              {u.is_locked && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                  <Lock className="h-3 w-3" /> locked
                </span>
              )}
              {u.failed_login_attempts > 0 && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  {u.failed_login_attempts} failed sign-in(s)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="Conversations" value={u.conversation_count} Icon={MessagesSquare} />
          <Stat label="Tickets" value={u.ticket_count} Icon={LifeBuoy} />
          <Stat label="Status" value={u.is_locked ? 'Locked' : 'Active'} Icon={u.is_locked ? Lock : Unlock} />
        </div>
      </div>

      {/* Admin actions */}
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-4">
        <h2 className="font-semibold mb-3">Admin actions</h2>
        <div className="flex flex-wrap gap-2">
          {u.role === 'admin' ? (
            <Button
              variant="outline"
              size="sm"
              disabled={isSelf || patchUser.isPending}
              onClick={() => patchUser.mutate({ role: 'user' })}
              title={isSelf ? "You can't demote yourself" : 'Demote to user'}
            >
              <ShieldOff className="h-4 w-4 mr-1.5" /> Demote to user
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={patchUser.isPending}
              onClick={() => patchUser.mutate({ role: 'admin' })}
            >
              <ShieldAlert className="h-4 w-4 mr-1.5" /> Promote to admin
            </Button>
          )}
          {u.is_locked ? (
            <Button
              variant="outline"
              size="sm"
              disabled={patchUser.isPending}
              onClick={() => patchUser.mutate({ locked: false })}
            >
              <Unlock className="h-4 w-4 mr-1.5" /> Unlock account
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={isSelf || patchUser.isPending}
              onClick={() => patchUser.mutate({ locked: true })}
              title={isSelf ? "You can't lock yourself" : 'Lock account'}
            >
              <Lock className="h-4 w-4 mr-1.5" /> Lock account
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            disabled={isSelf || deleteUser.isPending}
            onClick={() => setConfirmDelete(true)}
            title={isSelf ? "You can't delete yourself here" : 'Delete user'}
            className="ml-auto"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete user
          </Button>
        </div>
        {confirmDelete && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="flex items-center gap-2 text-destructive font-medium mb-2">
              <AlertTriangle className="h-4 w-4" /> Are you absolutely sure?
            </p>
            <p className="text-muted-foreground mb-3">
              This permanently deletes <b>{u.email}</b>, their {u.conversation_count} conversations, and {u.ticket_count} tickets. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={deleteUser.isPending} onClick={() => deleteUser.mutate()}>
                {deleteUser.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                Yes, delete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Activity */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <h2 className="font-semibold px-5 sm:px-6 py-4 border-b border-border">Activity history</h2>
        {activity.length === 0 ? (
          <p className="px-5 sm:px-6 py-6 text-sm text-muted-foreground">No activity recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((e) => {
              const { label, Icon, tone } = describeEvent(e.event_type);
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 sm:px-6 py-3">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-[11px] text-muted-foreground">{formatWhen(e.created_at)}</span>
                    </div>
                    {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                  </div>
                  {e.ip && <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">{e.ip}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, Icon }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <Icon className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  );
}
