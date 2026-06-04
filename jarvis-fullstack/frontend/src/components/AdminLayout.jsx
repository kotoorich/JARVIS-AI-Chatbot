import { useState } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, LifeBuoy, History, ArrowLeft, Menu, X, ShieldCheck, BookOpen,
} from 'lucide-react';
import UserAvatar from './UserAvatar';
import { useAuth } from '@/lib/AuthContext';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/modules', label: 'Modules', icon: BookOpen },
  { to: '/admin/tickets', label: 'Support', icon: LifeBuoy },
  { to: '/admin/activity', label: 'Activity', icon: History },
];

export default function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background font-inter text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border bg-sidebar text-sidebar-foreground shrink-0">
        <AdminNav onNavigate={() => {}} user={user} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="relative w-64 bg-sidebar text-sidebar-foreground border-r border-border">
            <AdminNav onNavigate={() => setOpen(false)} user={user} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center h-12 px-2 border-b border-border shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-2 hover:bg-muted rounded-lg md:hidden"
            aria-label="Open admin menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/chat" className="ml-1 p-2 text-sm flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2 px-2">
            <ShieldCheck className="h-4 w-4 text-cyan-500" />
            <span className="text-xs text-muted-foreground hidden sm:inline">Admin</span>
            <button
              onClick={() => navigate('/settings')}
              className="p-1.5 hover:bg-muted rounded-full"
              aria-label="Profile and settings"
            >
              <UserAvatar user={user} size="sm" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminNav({ onNavigate, user }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-cyan-500" />
          <span className="font-semibold text-sm tracking-tight">Admin</span>
        </div>
        <button
          onClick={onNavigate}
          className="md:hidden p-1 hover:bg-sidebar-accent rounded"
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="px-2 py-3 space-y-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <UserAvatar user={user} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{user?.full_name || user?.email}</p>
            <p className="text-[10px] text-muted-foreground truncate">Administrator</p>
          </div>
        </div>
      </div>
    </>
  );
}
