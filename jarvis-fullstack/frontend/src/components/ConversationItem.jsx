import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare, Pencil, Trash2, Check, X, Pin, PinOff, Archive, ArchiveRestore, MoreHorizontal,
} from 'lucide-react';

export default function ConversationItem({
  conversation,
  isActive,
  onClick,
  onDelete,
  onRename,
  onTogglePin,
  onToggleArchive,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const startEdit = (e) => {
    e?.stopPropagation();
    setEditTitle(conversation.title);
    setIsEditing(true);
    setMenuOpen(false);
  };

  const commitRename = () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversation.title) onRename(trimmed);
    setIsEditing(false);
  };

  const confirmDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (window.confirm(`Delete "${conversation.title}"? This cannot be undone.`)) {
      onDelete();
    }
  };

  return (
    <div
      className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
      }`}
      onClick={!isEditing ? onClick : undefined}
    >
      {conversation.is_pinned ? (
        <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <MessageSquare className="h-4 w-4 shrink-0 opacity-50" />
      )}

      {isEditing ? (
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setIsEditing(false);
            }}
            className="flex-1 bg-transparent border-b border-primary outline-none text-sm min-w-0"
            autoFocus
            onClick={(e) => e.stopPropagation()}
            maxLength={120}
          />
          <button onClick={(e) => { e.stopPropagation(); commitRename(); }} className="p-0.5 hover:text-primary" aria-label="Save name">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setIsEditing(false); }} className="p-0.5 hover:text-destructive" aria-label="Cancel rename">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <span className="flex-1 truncate">{conversation.title}</span>
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              className={`p-1 rounded transition-opacity ${
                menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
              } hover:bg-sidebar-accent`}
              aria-label="Chat actions"
              aria-haspopup="menu"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-7 z-30 w-44 bg-popover text-popover-foreground border border-border rounded-md shadow-lg py-1 text-sm"
              >
                <MenuItem onClick={() => { onTogglePin(); setMenuOpen(false); }}>
                  {conversation.is_pinned
                    ? <><PinOff className="h-3.5 w-3.5" /> Unpin</>
                    : <><Pin className="h-3.5 w-3.5" /> Pin</>}
                </MenuItem>
                <MenuItem onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" /> Rename
                </MenuItem>
                <MenuItem onClick={() => { onToggleArchive(); setMenuOpen(false); }}>
                  {conversation.is_archived
                    ? <><ArchiveRestore className="h-3.5 w-3.5" /> Unarchive</>
                    : <><Archive className="h-3.5 w-3.5" /> Archive</>}
                </MenuItem>
                <div className="h-px bg-border my-1" />
                <MenuItem onClick={confirmDelete} danger>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </MenuItem>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger = false }) {
  return (
    <button
      role="menuitem"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent ${
        danger ? 'text-destructive' : ''
      }`}
    >
      {children}
    </button>
  );
}
