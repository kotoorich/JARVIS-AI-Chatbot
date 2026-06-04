import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Trash2, Plus, Loader2, AlertTriangle, Eye, EyeOff,
  Pencil, Check, X, GripVertical, FolderPlus, FolderOpen, ChevronDown,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { apiErrorMessage } from '@/lib/api-error';
import useReorder from '@/hooks/useReorder';
import api from '@/api/Client';

const UNCATEGORIZED = '__uncategorized__';

export default function AdminModuleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: mod, isLoading } = useQuery({
    queryKey: ['admin', 'modules', id],
    queryFn: async () => (await api.get(`/api/admin/modules/${id}`)).data,
  });

  const patchModule = useMutation({
    mutationFn: async (body) => (await api.patch(`/api/admin/modules/${id}`, body)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'modules', id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
      toast({ title: 'Module saved' });
    },
    onError: (err) => toast({ title: 'Save failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const deleteModule = useMutation({
    mutationFn: async () => api.delete(`/api/admin/modules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
      toast({ title: 'Module deleted' });
      navigate('/admin/modules');
    },
    onError: (err) => toast({ title: 'Delete failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>;
  }
  if (!mod) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Module not found. <Link to="/admin/modules" className="underline">Back</Link>.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
      <button onClick={() => navigate('/admin/modules')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> All modules
      </button>

      <ModuleEditCard mod={mod} onSave={(body) => patchModule.mutate(body)} isPending={patchModule.isPending} />

      <CategoriesSection moduleId={mod.id} categories={mod.categories} />

      <QuestionsSection
        moduleId={mod.id}
        categories={mod.categories}
        questions={mod.questions}
      />

      <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <h2 className="font-semibold text-destructive flex items-center gap-2 mb-2">
          <AlertTriangle className="h-4 w-4" /> Danger zone
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          Deleting this module permanently removes it, all its categories, and all {mod.question_count} questions.
        </p>
        {confirmDelete ? (
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={deleteModule.isPending} onClick={() => deleteModule.mutate()}>
              {deleteModule.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Yes, delete module
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete module
          </Button>
        )}
      </div>
    </div>
  );
}

// =========================== Module metadata =================================
function ModuleEditCard({ mod, onSave, isPending }) {
  const [name, setName] = useState(mod.name);
  const [slug, setSlug] = useState(mod.slug);
  const [description, setDescription] = useState(mod.description || '');
  const [icon, setIcon] = useState(mod.icon || '');
  const [systemPrompt, setSystemPrompt] = useState(mod.system_prompt || '');
  const [isActive, setIsActive] = useState(mod.is_active);

  useEffect(() => {
    setName(mod.name); setSlug(mod.slug);
    setDescription(mod.description || ''); setIcon(mod.icon || '');
    setSystemPrompt(mod.system_prompt || '');
    setIsActive(mod.is_active);
  }, [mod.id, mod.name, mod.slug, mod.description, mod.icon, mod.system_prompt, mod.is_active]);

  const dirty =
    name !== mod.name ||
    slug !== mod.slug ||
    (description || null) !== (mod.description || null) ||
    (icon || null) !== (mod.icon || null) ||
    (systemPrompt || null) !== (mod.system_prompt || null) ||
    isActive !== mod.is_active;

  const handleExport = async () => {
    try {
      const res = await api.get(`/api/admin/modules/${mod.id}/export`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${mod.slug}.module.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-4">
      <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
        <h2 className="font-semibold text-lg">{mod.name}</h2>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export JSON
          </Button>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
            mod.is_active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
          }`}>
            {mod.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirty) return;
          onSave({
            name, slug, description, icon,
            system_prompt: systemPrompt,
            is_active: isActive,
          });
        }}
        className="space-y-4"
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="m-name">Name</Label>
            <Input id="m-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="m-slug">Slug</Label>
            <Input id="m-slug" value={slug} onChange={(e) => setSlug(e.target.value)} maxLength={80} className="mt-1.5 font-mono text-sm" />
          </div>
        </div>
        <div>
          <Label htmlFor="m-desc">Description</Label>
          <Input id="m-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="m-icon">Icon <span className="text-muted-foreground text-xs">(Lucide name, optional)</span></Label>
          <Input id="m-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={40} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="m-sysprompt">
            System prompt <span className="text-muted-foreground text-xs">
              (LLM only — sent when this module's name is mentioned and no canned answer matches)
            </span>
          </Label>
          <textarea
            id="m-sysprompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder="e.g. You are an expert chef. Give precise cooking instructions in metric units."
            className="w-full mt-1.5 text-sm bg-background border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Switch id="m-active" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="m-active" className="cursor-pointer">Visible to users</Label>
        </div>
        <Button type="submit" disabled={!dirty || isPending} size="sm">
          {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save changes
        </Button>
      </form>
    </div>
  );
}

// ============================ Categories section ============================
function CategoriesSection({ moduleId, categories }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'modules', String(moduleId)] });

  const create = useMutation({
    mutationFn: async (name) => (await api.post(`/api/admin/modules/${moduleId}/categories`, { name })).data,
    onSuccess: () => { invalidate(); setAdding(false); setNewName(''); toast({ title: 'Category added' }); },
    onError: (err) => toast({ title: 'Could not add', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const reorder = useMutation({
    mutationFn: async (ids) => api.post(`/api/admin/modules/${moduleId}/categories/reorder`, { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'modules', String(moduleId)] });
      const prev = queryClient.getQueryData(['admin', 'modules', String(moduleId)]);
      if (prev) {
        const byId = new Map(prev.categories.map((c) => [c.id, c]));
        queryClient.setQueryData(['admin', 'modules', String(moduleId)], {
          ...prev,
          categories: ids.map((id) => byId.get(id)).filter(Boolean),
        });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'modules', String(moduleId)], ctx.prev);
      toast({ title: 'Reorder failed', description: apiErrorMessage(err), variant: 'destructive' });
    },
    onSettled: invalidate,
  });

  const dnd = useReorder(
    categories.map((c) => c.id),
    (next) => reorder.mutate(next),
    { enabled: !reorder.isPending && categories.length > 1 },
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden mb-4">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Categories</h2>
          <p className="text-xs text-muted-foreground">
            {categories.length === 0
              ? 'Optional — group your questions by category.'
              : `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}${categories.length > 1 ? ' · drag to reorder' : ''}.`}
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <FolderPlus className="h-4 w-4 mr-1.5" /> Add category
          </Button>
        )}
      </div>

      {adding && (
        <div className="px-5 sm:px-6 py-3 border-b border-border bg-muted/20">
          <form
            onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate(newName.trim()); }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <Input
              autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name (e.g. 'Focus' or 'Planning')"
              minLength={1} maxLength={80} required
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={create.isPending || !newName.trim()}>
                {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                Add
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); setNewName(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {categories.length === 0 && !adding ? null : (
        <ul className="divide-y divide-border">
          {categories.map((c) => (
            <CategoryRow key={c.id} cat={c} moduleId={moduleId} dragProps={dnd.itemProps(c.id)} onChanged={invalidate} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CategoryRow({ cat, moduleId, dragProps, onChanged }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [name, setName] = useState(cat.name);
  useEffect(() => setName(cat.name), [cat.name]);

  const patch = useMutation({
    mutationFn: async (body) => (await api.patch(`/api/admin/categories/${cat.id}`, body)).data,
    onSuccess: () => { onChanged(); setEditing(false); },
    onError: (err) => toast({ title: 'Update failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async () => api.delete(`/api/admin/categories/${cat.id}`),
    onSuccess: () => { onChanged(); toast({ title: 'Category deleted', description: 'Its questions are now uncategorized.' }); },
    onError: (err) => toast({ title: 'Delete failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  return (
    <li
      {...dragProps}
      className={`px-5 sm:px-6 py-3 flex items-center gap-3 transition-colors ${
        dragProps?.['data-dragging'] ? 'opacity-30' : ''
      } ${dragProps?.['data-drop-target'] ? 'bg-cyan-500/5 outline outline-2 outline-cyan-500/40 outline-offset-[-2px]' : ''}`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing" aria-hidden="true" />
      {editing ? (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" maxLength={80} />
          <Button size="sm" onClick={() => patch.mutate({ name: name.trim() })} disabled={patch.isPending || !name.trim()}>
            {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(cat.name); }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{cat.name}</p>
            <p className="text-xs text-muted-foreground">
              {cat.question_count} {cat.question_count === 1 ? 'question' : 'questions'}
            </p>
            {confirmDel && (
              <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
                Delete? Questions will be uncategorized.
                <Button size="sm" variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
                  {del.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />} Yes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
              </div>
            )}
          </div>
          <button onClick={() => setEditing(true)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground" aria-label="Rename">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => setConfirmDel(true)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}

// ============================ Questions section ============================
function QuestionsSection({ moduleId, categories, questions }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'modules', String(moduleId)] });

  const create = useMutation({
    mutationFn: async (body) => (await api.post(`/api/admin/modules/${moduleId}/questions`, body)).data,
    onSuccess: () => { invalidate(); toast({ title: 'Question added' }); setAdding(false); },
    onError: (err) => toast({ title: 'Could not add question', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const reorder = useMutation({
    mutationFn: async (ids) => api.post(`/api/admin/modules/${moduleId}/questions/reorder`, { ids }),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'modules', String(moduleId)] });
      const prev = queryClient.getQueryData(['admin', 'modules', String(moduleId)]);
      if (prev) {
        const byId = new Map(prev.questions.map((q) => [q.id, q]));
        queryClient.setQueryData(['admin', 'modules', String(moduleId)], {
          ...prev,
          questions: ids.map((id) => byId.get(id)).filter(Boolean),
        });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['admin', 'modules', String(moduleId)], ctx.prev);
      toast({ title: 'Reorder failed', description: apiErrorMessage(err), variant: 'destructive' });
    },
    onSettled: invalidate,
  });

  // Group questions by category, preserving server order
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const c of categories) groups.set(String(c.id), { cat: c, items: [] });
    groups.set(UNCATEGORIZED, { cat: null, items: [] });
    for (const q of questions) {
      const key = q.category_id != null ? String(q.category_id) : UNCATEGORIZED;
      const bucket = groups.get(key) || groups.get(UNCATEGORIZED);
      bucket.items.push(q);
    }
    return [...groups.values()];
  }, [categories, questions]);

  const dnd = useReorder(
    questions.map((q) => q.id),
    (next) => reorder.mutate(next),
    { enabled: !reorder.isPending && questions.length > 1 },
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold">Questions</h2>
          <p className="text-xs text-muted-foreground">
            {questions.length} {questions.length === 1 ? 'question' : 'questions'}
            {questions.length > 1 && ' · drag rows to reorder'}
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add question
          </Button>
        )}
      </div>

      {adding && (
        <div className="px-5 sm:px-6 py-4 border-b border-border bg-muted/20">
          <NewQuestionForm
            categories={categories}
            onCancel={() => setAdding(false)}
            onSubmit={(body) => create.mutate(body)}
            isPending={create.isPending}
          />
        </div>
      )}

      {questions.length === 0 && !adding ? (
        <p className="px-5 sm:px-6 py-6 text-sm text-muted-foreground">
          No questions yet — add one to start teaching JARVIS this module.
        </p>
      ) : (
        <div>
          {grouped.map(({ cat, items }) => {
            if (items.length === 0) return null;
            return (
              <CategoryGroup
                key={cat?.id ?? UNCATEGORIZED}
                cat={cat} items={items} dnd={dnd}
                categories={categories} onChanged={invalidate}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryGroup({ cat, items, dnd, categories, onChanged }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-5 sm:px-6 py-2.5 bg-muted/20 border-b border-border text-xs uppercase tracking-wider text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        {cat ? cat.name : 'Uncategorized'}
        <span className="text-muted-foreground/60">· {items.length}</span>
      </button>
      {open && (
        <ul className="divide-y divide-border">
          {items.map((q) => (
            <QuestionRow
              key={q.id} q={q}
              categories={categories}
              dragProps={dnd.itemProps(q.id)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NewQuestionForm({ categories, onCancel, onSubmit, isPending }) {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [categoryId, setCategoryId] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (prompt.trim() && answer.trim()) {
          const body = { prompt: prompt.trim(), answer: answer.trim() };
          if (categoryId) body.category_id = Number(categoryId);
          onSubmit(body);
        }
      }}
      className="space-y-3"
    >
      <div>
        <Label htmlFor="q-prompt" className="text-xs">Prompt <span className="text-muted-foreground">(what users will ask)</span></Label>
        <Input
          id="q-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)}
          required minLength={2} maxLength={300}
          placeholder="e.g. How do I stay focused?"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="q-answer" className="text-xs">Answer <span className="text-muted-foreground">(what JARVIS will reply)</span></Label>
        <textarea
          id="q-answer" value={answer} onChange={(e) => setAnswer(e.target.value)}
          required minLength={1} maxLength={5000} rows={4}
          placeholder="JARVIS's response"
          className="w-full mt-1.5 text-sm bg-background border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
        />
      </div>
      {categories.length > 0 && (
        <div>
          <Label htmlFor="q-cat" className="text-xs">Category <span className="text-muted-foreground">(optional)</span></Label>
          <select
            id="q-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full mt-1.5 text-sm bg-background border border-border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !prompt.trim() || !answer.trim()}>
          {isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
          Save question
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>Cancel</Button>
      </div>
    </form>
  );
}

function QuestionRow({ q, categories, dragProps, onChanged }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer);
  const [categoryId, setCategoryId] = useState(q.category_id ? String(q.category_id) : '');

  useEffect(() => {
    setPrompt(q.prompt); setAnswer(q.answer);
    setCategoryId(q.category_id ? String(q.category_id) : '');
  }, [q.id, q.prompt, q.answer, q.category_id]);

  const patch = useMutation({
    mutationFn: async (body) => (await api.patch(`/api/admin/questions/${q.id}`, body)).data,
    onSuccess: () => { onChanged(); setEditing(false); },
    onError: (err) => toast({ title: 'Update failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const del = useMutation({
    mutationFn: async () => api.delete(`/api/admin/questions/${q.id}`),
    onSuccess: () => { onChanged(); toast({ title: 'Question deleted' }); },
    onError: (err) => toast({ title: 'Delete failed', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  const saveEdit = () => {
    const body = { prompt: prompt.trim(), answer: answer.trim() };
    // 0 means uncategorize on the API
    body.category_id = categoryId ? Number(categoryId) : 0;
    patch.mutate(body);
  };

  const dragging = dragProps?.['data-dragging'];
  const dropTarget = dragProps?.['data-drop-target'];

  if (editing) {
    return (
      <li className="px-5 sm:px-6 py-4 bg-muted/20">
        <div className="space-y-3">
          <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={300} />
          <textarea
            value={answer} onChange={(e) => setAnswer(e.target.value)}
            rows={4} maxLength={5000}
            className="w-full text-sm bg-background border border-border rounded-lg p-3 outline-none focus:ring-2 focus:ring-primary/30 resize-y"
          />
          {categories.length > 0 && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full text-sm bg-background border border-border rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
              aria-label="Category"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveEdit} disabled={patch.isPending || !prompt.trim() || !answer.trim()}>
              {patch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => {
              setEditing(false); setPrompt(q.prompt); setAnswer(q.answer);
              setCategoryId(q.category_id ? String(q.category_id) : '');
            }}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      {...dragProps}
      className={`px-5 sm:px-6 py-3 flex items-start gap-3 transition-colors ${
        dragging ? 'opacity-30' : ''
      } ${dropTarget ? 'bg-cyan-500/5 outline outline-2 outline-cyan-500/40 outline-offset-[-2px]' : ''}`}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0 cursor-grab active:cursor-grabbing mt-1" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium flex items-center gap-2">
          {q.prompt}
          {!q.is_active && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
              hidden
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{q.answer}</p>
        {confirmDel && (
          <div className="mt-2 flex items-center gap-2 text-xs text-destructive">
            Delete this question?
            <Button size="sm" variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
              {del.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Yes, delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => patch.mutate({ is_active: !q.is_active })}
          disabled={patch.isPending}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          title={q.is_active ? 'Hide from users' : 'Show to users'}
          aria-label={q.is_active ? 'Hide question' : 'Show question'}
        >
          {q.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
          aria-label="Edit question"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => setConfirmDel(true)}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
          aria-label="Delete question"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
