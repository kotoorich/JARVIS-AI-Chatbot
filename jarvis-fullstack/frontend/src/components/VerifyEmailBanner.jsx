import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Mail, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { apiErrorMessage } from '@/lib/api-error';
import api from '@/api/Client';

/**
 * Shown across the top of the app when the current user hasn't verified their
 * email yet. Dismissible per session via the X (saved in sessionStorage so it
 * doesn't nag while the user is reading their inbox).
 */
export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem('verify_banner_dismissed') === '1',
  );

  const resend = useMutation({
    mutationFn: async () => (await api.post('/api/users/me/resend-verification')).data,
    onSuccess: (data) => toast({ title: 'Verification email sent', description: data.message }),
    onError: (err) => toast({ title: 'Could not send', description: apiErrorMessage(err), variant: 'destructive' }),
  });

  if (!user || user.email_verified || dismissed) return null;

  return (
    <div role="status" className="bg-amber-500/10 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 text-sm">
      <div className="flex items-center gap-2 px-4 py-2 max-w-5xl mx-auto">
        <Mail className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Confirm your email so we can keep your account secure.
        </span>
        <button
          onClick={() => resend.mutate()}
          disabled={resend.isPending}
          className="font-medium underline hover:no-underline disabled:opacity-60 inline-flex items-center gap-1"
        >
          {resend.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          Resend link
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem('verify_banner_dismissed', '1');
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="p-1 rounded hover:bg-amber-500/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
