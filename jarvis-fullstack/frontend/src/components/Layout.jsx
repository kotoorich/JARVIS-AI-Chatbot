import { useState } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { Menu, Plus } from 'lucide-react';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import UserAvatar from './UserAvatar';
import NotificationBell from './NotificationBell';
import VerifyEmailBanner from './VerifyEmailBanner';
import { useAuth } from '@/lib/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background font-inter">
      {/* Desktop sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="hidden md:block overflow-hidden border-r border-sidebar-border shrink-0"
          >
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile sidebar (slide-over) */}
      <MobileSidebar open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0">
        <VerifyEmailBanner />
        <header className="flex items-center h-12 px-2 border-b border-border shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-muted rounded-lg transition-colors hidden md:flex"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate('/chat')}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="New chat"
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </button>
          <div className="flex-1 flex justify-center">
            <Link to="/chat" className="font-semibold text-sm tracking-tight hover:opacity-80 transition-opacity">
              JARVIS AI
            </Link>
          </div>
          <NotificationBell />
          <button
            onClick={() => navigate('/settings')}
            className="p-1.5 hover:bg-muted rounded-full transition-colors"
            aria-label="Profile and settings"
            title={user?.full_name || user?.email}
          >
            <UserAvatar user={user} size="sm" />
          </button>
        </header>

        <Outlet />
      </div>
    </div>
  );
}
