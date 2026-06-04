import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Send, Loader2, AlertCircle, CheckCircle2, Clock, X,
  ShieldCheck, User as UserIcon, LifeBuoy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { formatWhen } from '@/lib/activity';
import { apiErrorMessage } from '@/lib/api-error';
import api from '@/api/Client';

const STATUS_META = {
  open:        { Icon: AlertCircle,  tone: 'text-amber-500',   label: 'Open' },
  in_progress: { Icon: Clock,        tone: 'text-blue-500',    label: 'In progress' },
  resolved:    { Icon: CheckCircle2, tone: 'text-emerald-500', label: 'Resolved' },
  closed:      { Icon: X,            tone: 'text-slate-500',   label: 'Closed' },
};
const STATUS_ORDER = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export default function TicketDetail({ adminContext = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [replyBody, setReplyBody] = useState('');
  const endRef = useRef(null);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await api.get(`/api/tickets/${id}`)).data,
    refetchInterval: 15000,
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  const reply = useMutation({
    mutationFn: async () => (await api.post(`/api/tickets/${id}/reply`, { body: replyBody.trim() })).data,
    onSuccess: (data) => {
      queryClient.setQueryData(['ticket', id], data);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setReplyBody('');
    },
    onError: (err) => toast({ title: 'Reply failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const patchTicket = useMutation({
    mutationFn: async (body) => (await api.patch(`/api/admin/tickets/${id}`, body)).data,
    onSuccess: (t) => {
      // patch returns the bare ticket; merge into existing detail in cache
      queryClient.setQueryData(['ticket', id], (prev) => prev ? { ...prev, ...t } : t);
      queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
    onError: (err) => toast({ title: 'Update failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const backLink = adminContext ? '/admin/tickets' : '/support';

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>;
  }
  if (!ticket) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Ticket not found. <Link to={backLink} className="underline">Back</Link>.
      </div>
    );
  }

  const meta = STATUS_META[ticket.status] || STATUS_META.open;
  const closed = ticket.status === 'closed';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <button onClick={() => navigate(backLink)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> {adminContext ? 'All tickets' : 'My tickets'}
      </button>

      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-4">
        <div className="flex items-start gap-3 mb-3">
          <LifeBuoy className="h-5 w-5 text-muted-foreground mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold leading-tight">{ticket.subject}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              #{ticket.id} · opened {formatWhen(ticket.created_at)}
              {adminContext && ticket.user_email && <> · by <b>{ticket.user_full_name || ticket.user_email}</b></>}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted ${meta.tone}`}>
            <meta.Icon className="h-3 w-3" /> {meta.label}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            priority: {ticket.priority}
          </span>
        </div>

        {/* Admin controls */}
        {adminContext && (
          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Status:</span>
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  onClick={() => patchTicket.mutate({ status: s })}
                  disabled={patchTicket.isPending || s === ticket.status}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    s === ticket.status
                      ? 'border-foreground/40 bg-muted font-medium'
                      : 'border-border hover:bg-muted'
                  } disabled:opacity-60`}
                >
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground mr-1">Priority:</span>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => patchTicket.mutate({ priority: p })}
                  disabled={patchTicket.isPending || p === ticket.priority}
                  className={`text-xs px-2.5 py-1 rounded-md border transition ${
                    p === ticket.priority
                      ? 'border-foreground/40 bg-muted font-medium'
                      : 'border-border hover:bg-muted'
                  } disabled:opacity-60`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Thread */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border mb-4">
        {ticket.messages.map((m) => <Message key={m.id} m={m} meId={me?.id} adminContext={adminContext} />)}
        <div ref={endRef} />
      </div>

      {/* Reply box */}
      {closed ? (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          This ticket is closed. Open a new ticket if you need further help.
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); if (replyBody.trim()) reply.mutate(); }}
          className="rounded-xl border border-border bg-card p-4"
        >
          <label htmlFor="reply" className="block text-xs font-medium text-muted-foreground mb-1.5">
            {adminContext ? 'Reply as staff' : 'Add a reply'}
          </label>
          <textarea
            id="reply"
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Type your reply…"
            className="w-full text-sm bg-background border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          />
          <div className="flex justify-end mt-2">
            <Button type="submit" size="sm" disabled={!replyBody.trim() || reply.isPending}>
              {reply.isPending
                ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                : <Send className="h-4 w-4 mr-1.5" />}
              Send reply
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Message({ m, meId, adminContext }) {
  const mine = m.author_id === meId;
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1.5">
        {m.is_staff_reply
          ? <ShieldCheck className="h-3.5 w-3.5 text-cyan-500" />
          : <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-xs font-medium">
          {m.is_staff_reply ? 'Support' : (mine && !adminContext ? 'You' : `User #${m.author_id}`)}
        </span>
        <span className="text-[11px] text-muted-foreground">{formatWhen(m.created_at)}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap text-foreground/90">{m.body}</p>
    </div>
  );
}
