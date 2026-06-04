import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, LifeBuoy, Loader2, AlertCircle, Clock, CheckCircle2, X, ArrowLeft, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { formatWhen } from '@/lib/activity';
import { apiErrorMessage } from '@/lib/api-error';
import api from '@/api/Client';

const STATUS_META = {
  open:        { Icon: AlertCircle,  tone: 'text-amber-500',   label: 'Open' },
  in_progress: { Icon: Clock,        tone: 'text-blue-500',    label: 'In progress' },
  resolved:    { Icon: CheckCircle2, tone: 'text-emerald-500', label: 'Resolved' },
  closed:      { Icon: X,            tone: 'text-slate-500',   label: 'Closed' },
};

export default function Support() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => (await api.get('/api/tickets')).data,
    refetchInterval: 20000,
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <LifeBuoy className="h-7 w-7 text-cyan-500" /> Support
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Need help? Open a ticket and our team will get back to you.
            </p>
          </div>
          {!creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New ticket
            </Button>
          )}
        </div>

        {creating && <NewTicketForm onClose={() => setCreating(false)} />}

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading your tickets…
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <LifeBuoy className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">You haven't opened any tickets yet.</p>
            {!creating && (
              <Button onClick={() => setCreating(true)} variant="outline" size="sm" className="mt-4">
                <Plus className="h-4 w-4 mr-1.5" /> Open your first ticket
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            {tickets.map((t) => {
              const meta = STATUS_META[t.status] || STATUS_META.open;
              return (
                <Link
                  key={t.id}
                  to={`/support/${t.id}`}
                  className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-muted/30 transition-colors"
                >
                  <meta.Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      #{t.id} · {meta.label} · updated {formatWhen(t.updated_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NewTicketForm({ onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');

  const create = useMutation({
    mutationFn: async () => (await api.post('/api/tickets', {
      subject: subject.trim(), body: body.trim(), priority,
    })).data,
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast({ title: 'Ticket opened', description: `#${t.id} — we'll get back to you soon.` });
      navigate(`/support/${t.id}`);
    },
    onError: (err) => toast({ title: 'Could not open ticket', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-6">
      <h2 className="font-semibold mb-4">Open a new ticket</h2>
      <form
        onSubmit={(e) => { e.preventDefault(); if (subject.trim() && body.trim()) create.mutate(); }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary" maxLength={200} minLength={3} required className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="body">Describe the issue</Label>
          <textarea
            id="body" value={body} onChange={(e) => setBody(e.target.value)}
            rows={5} minLength={5} maxLength={5000} required
            placeholder="What were you doing, what did you expect, and what happened instead?"
            className="w-full text-sm bg-background border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/30 mt-1.5 resize-y"
          />
        </div>
        <div>
          <Label htmlFor="priority">Priority</Label>
          <div className="flex gap-1 bg-muted rounded-lg p-1 text-xs w-fit mt-1.5">
            {['low', 'normal', 'high', 'urgent'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`px-3 py-1.5 rounded-md transition capitalize ${
                  priority === p ? 'bg-background shadow-sm font-medium' : 'opacity-70'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Submit ticket
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
