import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { preserveLineBreaks } from '@/lib/markdown';
import {
  BookOpen, Loader2, ArrowLeft, ArrowRight, MessageSquare, Sparkles,
  Brain, GraduationCap, Lightbulb, Heart, Code2, Globe, Calculator,
  Stethoscope, Briefcase, Music, ChevronDown,
} from 'lucide-react';
import api from '@/api/Client';

// Map a small set of icon names users might choose for modules. Unknown
// names fall back to BookOpen.
const ICONS = {
  BookOpen, Sparkles, Brain, GraduationCap, Lightbulb, Heart, Code2,
  Globe, Calculator, Stethoscope, Briefcase, Music, MessageSquare,
};

function ModuleIcon({ name, className }) {
  const Cmp = ICONS[name] || BookOpen;
  return <Cmp className={className} />;
}

export default function Modules() {
  const { slug } = useParams();
  if (slug) return <ModuleDetail slug={slug} />;
  return <ModulesList />;
}

function ModulesList() {
  const navigate = useNavigate();
  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => (await api.get('/api/modules')).data,
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-7 w-7 text-cyan-500" /> Knowledge modules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a topic to see what JARVIS already knows about it.
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
          </div>
        ) : modules.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No modules available yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m) => (
              <Link
                key={m.id}
                to={`/modules/${m.slug}`}
                className="rounded-xl border border-border bg-card p-4 hover:border-cyan-500/40 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
                    <ModuleIcon name={m.icon} className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate group-hover:text-foreground">{m.name}</p>
                    {m.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{m.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {m.question_count} {m.question_count === 1 ? 'question' : 'questions'}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleDetail({ slug }) {
  const navigate = useNavigate();
  const { data: mod, isLoading, isError } = useQuery({
    queryKey: ['modules', slug],
    queryFn: async () => (await api.get(`/api/modules/${slug}`)).data,
  });

  // When the user clicks a question, navigate to chat with the prompt prefilled.
  // Chat reads URL search param `prompt` and pre-fills the composer.
  const askInChat = (prompt) => {
    navigate(`/chat?prompt=${encodeURIComponent(prompt)}`);
  };

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>;
  }
  if (isError || !mod) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Module not found. <Link to="/modules" className="underline">Browse all modules</Link>.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <button onClick={() => navigate('/modules')} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> All modules
        </button>

        <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
              <ModuleIcon name={mod.icon} className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">{mod.name}</h1>
              {mod.description && <p className="text-sm text-muted-foreground mt-1">{mod.description}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                {mod.question_count} {mod.question_count === 1 ? 'question' : 'questions'}
              </p>
            </div>
          </div>
        </div>

        {mod.questions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            This module doesn't have any questions yet.
          </div>
        ) : (
          <GroupedQuestions
            categories={mod.categories || []}
            questions={mod.questions}
            onAsk={askInChat}
          />
        )}
      </div>
    </div>
  );
}

function GroupedQuestions({ categories, questions, onAsk }) {
  // Bucket questions by category in the server's order
  const grouped = useMemo(() => {
    const groups = new Map();
    for (const c of categories) groups.set(String(c.id), { cat: c, items: [] });
    groups.set('__uncategorized__', { cat: null, items: [] });
    for (const q of questions) {
      const key = q.category_id != null ? String(q.category_id) : '__uncategorized__';
      const bucket = groups.get(key) || groups.get('__uncategorized__');
      bucket.items.push(q);
    }
    return [...groups.values()].filter((g) => g.items.length > 0);
  }, [categories, questions]);

  // If there's only one bucket and no real categories, render a flat list
  // (no group headers cluttering things up).
  if (grouped.length === 1 && grouped[0].cat === null) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
        {grouped[0].items.map((q) => <QuestionButton key={q.id} q={q} onAsk={onAsk} />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map(({ cat, items }) => (
        <CategorySection key={cat?.id ?? 'uncategorized'} cat={cat} items={items} onAsk={onAsk} />
      ))}
    </div>
  );
}

function CategorySection({ cat, items, onAsk }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 sm:px-6 py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <span className="font-semibold text-sm">{cat ? cat.name : 'Other questions'}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? 'question' : 'questions'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-border divide-y divide-border">
          {items.map((q) => <QuestionButton key={q.id} q={q} onAsk={onAsk} />)}
        </div>
      )}
    </div>
  );
}

function QuestionButton({ q, onAsk }) {
  return (
    <button
      onClick={() => onAsk(q.prompt)}
      className="w-full text-left px-5 sm:px-6 py-4 hover:bg-muted/30 transition-colors group"
    >
      <p className="text-sm font-medium flex items-center gap-2 group-hover:text-cyan-500">
        <MessageSquare className="h-4 w-4 shrink-0" />
        {q.prompt}
      </p>
      {/* Show the answer in full, preserving the author's line breaks,
          paragraphs, lists, and other markdown structure exactly as typed.
          No line-clamp, no collapsed prose spacing. */}
      <div className="prose prose-sm dark:prose-invert max-w-none ml-6 mt-2 text-sm text-muted-foreground
                      prose-pre:whitespace-pre-wrap prose-code:bg-muted prose-code:px-1 prose-code:rounded">
        <ReactMarkdown>{preserveLineBreaks(q.answer)}</ReactMarkdown>
      </div>
    </button>
  );
}
