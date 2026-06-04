import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Search, Settings, LogOut, Archive, MessagesSquare, X, LifeBuoy, ShieldCheck, BookOpen } from 'lucide-react';
import JarvisLogo from './JarvisLogo';
import ConversationItem from './ConversationItem';
import ThemeToggle from './ThemeToggle';
import UserAvatar from './UserAvatar';
import { useAuth } from '@/lib/AuthContext';
import api from '@/api/Client';

function useDebounced(value, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function Sidebar({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();

  const [searchInput, setSearchInput] = useState('');
  const [view, setView] = useState('active'); // 'active' | 'archived'
  const debouncedSearch = useDebounced(searchInput.trim(), 250);

  const activeId = location.pathname.startsWith('/chat/')
    ? location.pathname.replace('/chat/', '')
    : null;

  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['conversations', { archived: view === 'archived', q: debouncedSearch }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('archived', view === 'archived' ? 'true' : 'false');
      if (debouncedSearch) params.set('q', debouncedSearch);
      const res = await api.get(`/api/conversations?${params.toString()}`);
      return res.data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['conversations'] });

  const newChat = () => {
    // Navigate to /chat (with no id) — the Chat page will create the conversation
    // server-side when the user sends their first message, and the server-generated
    // smart title will appear in the sidebar automatically.
    navigate('/chat');
    onClose?.();
  };

  const deleteConv = useMutation({
    mutationFn: async (id) => api.delete(`/api/conversations/${id}`),
    onSuccess: (_d, id) => {
      invalidate();
      if (String(id) === activeId) navigate('/chat');
    },
  });

  const patchConv = useMutation({
    mutationFn: async ({ id, ...body }) =>
      (await api.patch(`/api/conversations/${id}`, body)).data,
    onSuccess: invalidate,
  });

  const { pinned, regular } = useMemo(() => {
    const p = [], r = [];
    for (const c of conversations) (c.is_pinned ? p : r).push(c);
    return { pinned: p, regular: r };
  }, [conversations]);

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground w-64">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
        <JarvisLogo size={28} />
        <span className="font-bold text-sm tracking-tight">JARVIS AI</span>
      </div>

      {/* New chat */}
      <div className="px-3 pb-2 shrink-0">
        <button
          onClick={newChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-sidebar-border hover:bg-sidebar-accent transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search chats…"
            className="w-full pl-8 pr-7 py-2 text-xs bg-sidebar-accent rounded-lg outline-none focus:ring-1 focus:ring-primary/50"
            aria-label="Search conversations"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-1 top-1.5 p-1 rounded hover:bg-background/40"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Active / Archived toggle */}
      <div className="px-3 pb-1 shrink-0">
        <div className="flex bg-sidebar-accent/60 rounded-lg p-0.5 text-xs">
          <button
            onClick={() => setView('active')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition ${
              view === 'active' ? 'bg-background shadow-sm font-medium' : 'opacity-70'
            }`}
          >
            <MessagesSquare className="h-3 w-3" /> Active
          </button>
          <button
            onClick={() => setView('archived')}
            className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition ${
              view === 'archived' ? 'bg-background shadow-sm font-medium' : 'opacity-70'
            }`}
          >
            <Archive className="h-3 w-3" /> Archived
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pt-1 space-y-0.5">
        {isLoading && (
          <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
        )}
        {!isLoading && conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">
            {debouncedSearch
              ? 'No matches'
              : view === 'archived'
              ? 'No archived chats'
              : 'No conversations yet'}
          </p>
        )}

        {pinned.length > 0 && (
          <>
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Pinned
            </p>
            {pinned.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={String(conv.id) === activeId}
                onClick={() => { navigate(`/chat/${conv.id}`); onClose?.(); }}
                onDelete={() => deleteConv.mutate(conv.id)}
                onRename={(title) => patchConv.mutate({ id: conv.id, title })}
                onTogglePin={() => patchConv.mutate({ id: conv.id, is_pinned: !conv.is_pinned })}
                onToggleArchive={() => patchConv.mutate({ id: conv.id, is_archived: !conv.is_archived })}
              />
            ))}
            {regular.length > 0 && (
              <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Recent
              </p>
            )}
          </>
        )}

        {regular.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            isActive={String(conv.id) === activeId}
            onClick={() => { navigate(`/chat/${conv.id}`); onClose?.(); }}
            onDelete={() => deleteConv.mutate(conv.id)}
            onRename={(title) => patchConv.mutate({ id: conv.id, title })}
            onTogglePin={() => patchConv.mutate({ id: conv.id, is_pinned: !conv.is_pinned })}
            onToggleArchive={() => patchConv.mutate({ id: conv.id, is_archived: !conv.is_archived })}
          />
        ))}
      </div>

      {/* Footer: user + settings */}
      <div className="p-3 border-t border-sidebar-border space-y-1 shrink-0">
        {user?.role === 'admin' && (
          <button
            onClick={() => { navigate('/modules'); onClose?.(); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
          >
            <BookOpen className="h-3.5 w-3.5" /> Modules
          </button>
        )}
        <button
          onClick={() => { navigate('/support'); onClose?.(); }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sm text-muted-foreground hover:text-foreground"
        >
          <LifeBuoy className="h-3.5 w-3.5" /> Support
        </button>
        {user?.role === 'admin' && (
          <button
            onClick={() => { navigate('/admin'); onClose?.(); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors text-sm text-cyan-500 hover:text-cyan-400"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Admin dashboard
          </button>
        )}
        <div className="flex items-center justify-between px-2 pt-1">
          <ThemeToggle />
          <button
            onClick={() => { navigate('/settings'); onClose?.(); }}
            className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors"
            aria-label="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => { navigate('/settings'); onClose?.(); }}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left"
        >
          <UserAvatar user={user} size="sm" />
          <span className="text-sm truncate flex-1">
            {user?.full_name || user?.username || user?.email || 'User'}
          </span>
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-destructive transition-colors text-sm"
        >
          <LogOut className="h-3.5 w-3.5" /> Log out
        </button>
      </div>
    </div>
  );
}
