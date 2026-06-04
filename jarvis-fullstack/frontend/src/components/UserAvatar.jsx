import { apiBase } from '@/api/Client';

/**
 * Renders a user's avatar image if avatar_url is set, otherwise their initials
 * inside a colored circle.
 *
 * Props:
 *   user: { avatar_url, full_name, username, email }
 *   size: 'sm' | 'md' | 'lg' (defaults to 'md')
 *   className: optional extra Tailwind classes
 */
export default function UserAvatar({ user, size = 'md', className = '' }) {
  const sizeClasses = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-20 w-20 text-2xl',
  };

  const initials = getInitials(user);
  const url = user?.avatar_url
    ? (user.avatar_url.startsWith('http') ? user.avatar_url : `${apiBase}${user.avatar_url}`)
    : null;

  return (
    <div
      className={`${sizeClasses[size]} rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-semibold select-none ${className}`}
      aria-label={user?.full_name || user?.email || 'User'}
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}

function getInitials(user) {
  if (!user) return '?';
  const source = user.full_name || user.username || user.email || '';
  const parts = source.trim().split(/[\s@.]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
