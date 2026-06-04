import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus, BookOpen, Loader2, Eye, EyeOff, GripVertical, ChevronRight, Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiErrorMessage } from '@/lib/api-error';
import { formatWhen } from '@/lib/activity';
import useReorder from '@/hooks/useReorder';
import api from '@/api/Client';

export default function AdminModules() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef(null);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['admin', 'modules'],
    queryFn: async () => (await api.get('/api/admin/modules')).data,
  });

  const create = useMutation({
    mutationFn: async (body) => (await api.post('/api/admin/modules', body)).data,
    onSuccess: (m) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
      toast({ title: 'Module created' });
      navigate(`/admin/modules/${m.id}`);
    },
    onError: (err) => toast({ title: 'Could not create module', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }) =>
      (await api.patch(`/api/admin/modules/${id}`, { is_active })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] }),
    onError: (err) => toast({ title: 'Update failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const reorderModules = useMutation({
    mutationFn: async (ids) => api.post('/api/admin/modules/reorder', { ids }),
    // Optimistic update so the UI doesn't snap back during the round-trip.
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'modules'] });
      const prev = queryClient.getQueryData(['admin', 'modules']);
      if (prev) {
        const byId = new Map(prev.map((m) => [m.id, m]));
        queryClient.setQueryData(['admin', 'modules'], ids.map((id) => byId.get(id)).filter(Boolean));
      }
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'modules'], ctx.prev);
      toast({ title: 'Reorder failed', description: apiErrorMessage(err), variant: 'destructive' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] }),
  });

  const reorder = useReorder(
    modules.map((m) => m.id),
    (nextIds) => reorderModules.mutate(nextIds),
    { enabled: !reorderModules.isPending },
  );

  const importModule = useMutation({
    mutationFn: async (payload) => (await api.post('/api/admin/modules/import', payload)).data,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
      toast({
        title: 'Module imported',
        description: `${data.name} created with ${data.questions?.length || 0} questions.`,
      });
      navigate(`/admin/modules/${data.id}`);
    },
    onError: (err) => toast({ title: 'Import failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';  // reset so the same file can be re-picked
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      importModule.mutate(payload);
    } catch (err) {
      toast({
        title: 'Could not read file',
        description: 'The file must be a valid module JSON export.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Modules</h1>
          <p className="text-sm text-muted-foreground">
            Knowledge modules JARVIS uses to answer specific questions.
            {modules.length > 1 && <span className="hidden sm:inline"> · Drag rows to reorder.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFilePick}
            className="hidden"
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importModule.isPending}
          >
            {importModule.isPending
              ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              : <Upload className="h-4 w-4 mr-1.5" />}
            Import
          </Button>
          {!creating && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> New module
            </Button>
          )}
        </div>
      </div>

      {creating && (
        <NewModuleForm
          onCancel={() => setCreating(false)}
          onSubmit={(body) => create.mutate(body)}
          isPending={create.isPending}
        />
      )}

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading modules…
        </div>
      ) : modules.length === 0 && !creating ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No modules yet.</p>
          <Button onClick={() => setCreating(true)} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> Create the first module
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {modules.map((m) => {
            const dragProps = reorder.itemProps(m.id);
            return (
            <div
              key={m.id}
              {...dragProps}
              className={`flex items-center gap-3 px-4 sm:px-5 py-3 transition-colors group ${
                dragProps['data-dragging'] ? 'opacity-30' : 'hover:bg-muted/30'
              } ${dragProps['data-drop-target'] ? 'bg-cyan-500/5 outline outline-2 outline-cyan-500/40 outline-offset-[-2px]' : ''}`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" aria-hidden="true" />
              <Link to={`/admin/modules/${m.id}`} className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate flex items-center gap-2">
                  {m.name}
                  {!m.is_active && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      inactive
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  /{m.slug} · {m.question_count} {m.question_count === 1 ? 'question' : 'questions'}
                  {m.updated_at && ` · updated ${formatWhen(m.updated_at)}`}
                </p>
              </Link>
              <button
                onClick={() => toggleActive.mutate({ id: m.id, is_active: !m.is_active })}
                disabled={toggleActive.isPending}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                title={m.is_active ? 'Deactivate' : 'Activate'}
                aria-label={m.is_active ? 'Deactivate' : 'Activate'}
              >
                {m.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <Link to={`/admin/modules/${m.id}`} className="p-1.5 text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewModuleForm({ onCancel, onSubmit, isPending }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-6">
      <h2 className="font-semibold mb-4">New module</h2>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), description: description.trim(), icon: icon.trim() }); }}
        className="space-y-4"
      >
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} placeholder="e.g. Productivity Tips" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="What's this module about?" className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="icon">Icon name <span className="text-muted-foreground text-xs">(optional, Lucide icon name)</span></Label>
          <Input id="icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={40} placeholder="e.g. Sparkles" className="mt-1.5" />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending || !name.trim()}>
            {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Create module
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
