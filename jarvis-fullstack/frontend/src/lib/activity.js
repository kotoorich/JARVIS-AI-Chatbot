import {
  LogIn, LogOut, UserPlus, KeyRound, Mail, ShieldAlert, Lock, Unlock,
  UserCog, Trash2, LifeBuoy, Pencil, Activity, AlertTriangle,
} from 'lucide-react';

/**
 * Maps backend event_type values to a friendly label + icon + color class.
 * Anything unknown gets a sensible default.
 */
const EVENT_MAP = {
  register:             { label: 'Account created',    Icon: UserPlus,    tone: 'text-cyan-500' },
  login_success:        { label: 'Signed in',          Icon: LogIn,       tone: 'text-emerald-500' },
  login_failed:         { label: 'Failed sign-in',     Icon: ShieldAlert, tone: 'text-amber-500' },
  login_blocked:        { label: 'Blocked sign-in',    Icon: Lock,        tone: 'text-amber-600' },
  account_locked:       { label: 'Account locked',     Icon: Lock,        tone: 'text-red-500' },
  password_changed:     { label: 'Password changed',   Icon: KeyRound,    tone: 'text-cyan-500' },
  email_changed:        { label: 'Email changed',      Icon: Mail,        tone: 'text-cyan-500' },
  profile_updated:      { label: 'Profile updated',    Icon: Pencil,      tone: 'text-slate-500' },
  admin_user_updated:   { label: 'Admin updated user', Icon: UserCog,     tone: 'text-purple-500' },
  admin_user_deleted:   { label: 'Admin deleted user', Icon: Trash2,      tone: 'text-red-500' },
  admin_ticket_updated: { label: 'Admin updated ticket', Icon: LifeBuoy,  tone: 'text-purple-500' },
  ticket_opened:        { label: 'Ticket opened',      Icon: LifeBuoy,    tone: 'text-cyan-500' },
};

export function describeEvent(type) {
  return EVENT_MAP[type] || { label: type, Icon: Activity, tone: 'text-slate-500' };
}

/** Format an ISO datetime as a short relative or fallback to a date. */
export function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} d ago`;
  return d.toLocaleDateString();
}
