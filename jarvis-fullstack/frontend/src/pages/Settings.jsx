import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Moon, Sun, User, Mail, Lock, Camera, Trash2,
  Download, AlertTriangle, Loader2, Save, Palette,
  Database, ShieldCheck, Activity as ActivityIcon, LifeBuoy, MailCheck,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import UserAvatar from '@/components/UserAvatar';
import useTheme from '@/hooks/useTheme';
import { useAuth } from '@/lib/AuthContext';
import { apiErrorMessage } from '@/lib/api-error';
import { describeEvent, formatWhen } from '@/lib/activity';
import api from '@/api/Client';

export default function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout, refreshUser, setUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  if (!user) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
          </div>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5">
            <TabsTrigger value="profile" className="gap-1.5">
              <User className="h-3.5 w-3.5" /> <span>Profile</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> <span>Account</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-1.5">
              <Palette className="h-3.5 w-3.5" /> <span>Appearance</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="gap-1.5">
              <ActivityIcon className="h-3.5 w-3.5" /> <span>Activity</span>
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-1.5">
              <Database className="h-3.5 w-3.5" /> <span>Data</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab user={user} setUser={setUser} refreshUser={refreshUser} toast={toast} />
          </TabsContent>
          <TabsContent value="account" className="mt-6">
            <AccountTab user={user} setUser={setUser} toast={toast} />
          </TabsContent>
          <TabsContent value="appearance" className="mt-6">
            <AppearanceTab theme={theme} toggleTheme={toggleTheme} />
          </TabsContent>
          <TabsContent value="activity" className="mt-6">
            <ActivityTab />
          </TabsContent>
          <TabsContent value="data" className="mt-6">
            <DataTab queryClient={queryClient} logout={logout} toast={toast} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// =============================== Profile tab ===============================
function ProfileTab({ user, setUser, refreshUser, toast }) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [username, setUsername] = useState(user.username || '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  const saveProfile = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/api/users/me', {
        full_name: fullName.trim() || null,
        username: username.trim() || null,
      });
      setUser(res.data);
      toast({ title: 'Profile updated' });
    } catch (err) {
      toast({ title: 'Could not update profile', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const onAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Image too large', description: 'Max 2 MB', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/api/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data);
      toast({ title: 'Profile photo updated' });
    } catch (err) {
      toast({ title: 'Upload failed', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    try {
      const res = await api.delete('/api/users/me/avatar');
      setUser(res.data);
      toast({ title: 'Profile photo removed' });
    } catch (err) {
      toast({ title: 'Remove failed', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <Section title="Profile picture" description="This image appears in the sidebar and top bar.">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <UserAvatar user={user} size="lg" />
        <div className="flex flex-col gap-2 items-center sm:items-start">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onAvatarFileChange}
            className="hidden"
          />
          <div className="flex gap-2 flex-wrap justify-center sm:justify-start">
            <Button type="button" variant="outline" size="sm" disabled={uploadingAvatar} onClick={() => fileInputRef.current?.click()}>
              {uploadingAvatar ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Camera className="h-4 w-4 mr-1.5" />}
              {user.avatar_url ? 'Change photo' : 'Upload photo'}
            </Button>
            {user.avatar_url && (
              <Button type="button" variant="ghost" size="sm" disabled={uploadingAvatar} onClick={removeAvatar}>
                <Trash2 className="h-4 w-4 mr-1.5" /> Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center sm:text-left">JPEG, PNG, WEBP, or GIF — up to 2 MB.</p>
        </div>
      </div>

      <Separator className="my-6" />

      <form onSubmit={saveProfile} className="space-y-4">
        <div>
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" maxLength={80} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. tony_stark" maxLength={32} className="mt-1.5" autoCapitalize="off" spellCheck={false} />
          <p className="text-xs text-muted-foreground mt-1">3–32 characters; letters, numbers, dot, underscore, dash.</p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save changes
        </Button>
      </form>
    </Section>
  );
}

// =============================== Account tab ===============================
function AccountTab({ user, setUser, toast }) {
  return (
    <div className="space-y-4">
      <EmailVerificationStatus user={user} toast={toast} />
      <Section title="Email address" description={`Currently signed in as ${user.email}.`}>
        <EmailForm user={user} setUser={setUser} toast={toast} />
      </Section>
      <Section title="Password" description="Use a password you don't use anywhere else.">
        <PasswordForm toast={toast} />
      </Section>
    </div>
  );
}

function EmailVerificationStatus({ user, toast }) {
  const [sending, setSending] = useState(false);
  const verified = user.email_verified;

  const resend = async () => {
    setSending(true);
    try {
      const res = await api.post('/api/users/me/resend-verification');
      toast({ title: 'Verification email sent', description: res.data.message });
    } catch (err) {
      toast({ title: 'Could not send', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${
      verified
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          verified ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                   : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        }`}>
          {verified ? <MailCheck className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">
            {verified ? 'Email verified' : 'Email not verified yet'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {verified
              ? `${user.email} has been confirmed.`
              : `We sent a verification link to ${user.email}. It expires after 48 hours.`}
          </p>
          {!verified && (
            <Button size="sm" variant="outline" className="mt-3" disabled={sending} onClick={resend}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Mail className="h-3.5 w-3.5 mr-1.5" />}
              Resend verification email
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailForm({ user, setUser, toast }) {
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (email.trim() === user.email) {
      toast({ title: 'No change', description: 'Email is already up to date.' });
      return;
    }
    setSaving(true);
    try {
      const res = await api.put('/api/users/me/email', { new_email: email.trim(), current_password: password });
      setUser(res.data);
      setPassword('');
      toast({ title: 'Email updated' });
    } catch (err) {
      toast({ title: 'Could not change email', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <Label htmlFor="new_email">New email</Label>
        <div className="relative mt-1.5">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input id="new_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" required />
        </div>
      </div>
      <div>
        <Label htmlFor="confirm_pw_email">Confirm with current password</Label>
        <div className="relative mt-1.5">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input id="confirm_pw_email" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" required />
        </div>
      </div>
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Update email
      </Button>
    </form>
  );
}

function PasswordForm({ toast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      toast({ title: 'Passwords do not match', description: 'The new password and confirmation must match.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await api.put('/api/users/me/password', { current_password: current, new_password: next });
      setCurrent(''); setNext(''); setConfirm('');
      toast({ title: 'Password updated', description: 'Use your new password next time.' });
    } catch (err) {
      toast({ title: 'Could not change password', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <PwInput id="cur_pw" label="Current password" value={current} onChange={setCurrent} />
      <PwInput id="new_pw" label="New password" value={next} onChange={setNext} hint="At least 8 characters, with a letter and a number." />
      <PwInput id="confirm_pw" label="Confirm new password" value={confirm} onChange={setConfirm} />
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
        Update password
      </Button>
    </form>
  );
}

function PwInput({ id, label, value, onChange, hint }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1.5">
        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input id={id} type="password" value={value} onChange={(e) => onChange(e.target.value)} className="pl-9" required minLength={8} />
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

// =============================== Appearance ===============================
function AppearanceTab({ theme, toggleTheme }) {
  return (
    <Section title="Appearance" description="Customize how JARVIS looks.">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {theme === 'dark' ? <Moon className="h-5 w-5 text-primary" /> : <Sun className="h-5 w-5 text-primary" />}
          <div>
            <p className="font-medium">Dark mode</p>
            <p className="text-sm text-muted-foreground">Use a dark colour scheme.</p>
          </div>
        </div>
        <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} aria-label="Toggle dark mode" />
      </div>
    </Section>
  );
}

// =============================== Activity tab ===============================
function ActivityTab() {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['user', 'activity'],
    queryFn: async () => (await api.get('/api/users/me/activity?limit=100')).data,
  });

  return (
    <Section title="Account activity" description="Recent security events on your account.">
      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 inline mr-1.5 animate-spin" /> Loading…
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => {
            const { label, Icon, tone } = describeEvent(e.event_type);
            return (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-[11px] text-muted-foreground">{formatWhen(e.created_at)}</span>
                  </div>
                  {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                </div>
                {e.ip && <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">{e.ip}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// =============================== Data tab ===============================
function DataTab({ queryClient, logout, toast }) {
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await api.get('/api/users/me/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jarvis-export-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Export ready', description: 'Your data has been downloaded.' });
    } catch (err) {
      toast({ title: 'Export failed', description: apiErrorMessage(err), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Download your data" description="Get a JSON snapshot of your account and chats.">
        <Button onClick={exportData} disabled={exporting} variant="outline">
          {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
          Download account data
        </Button>
      </Section>

      <Section title="Danger zone" description="Once deleted, your account and all conversations cannot be recovered." danger>
        {showDelete ? (
          <DeleteAccountForm onCancel={() => setShowDelete(false)} onDeleted={() => { queryClient.clear(); logout(); }} toast={toast} />
        ) : (
          <Button variant="destructive" onClick={() => setShowDelete(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete my account
          </Button>
        )}
      </Section>
    </div>
  );
}

function DeleteAccountForm({ onCancel, onDeleted, toast }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (confirm.trim().toLowerCase() !== 'delete') {
      toast({ title: 'Confirmation required', description: 'Type "delete" to confirm.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      await api.delete('/api/users/me', { data: { current_password: password } });
      toast({ title: 'Account deleted' });
      onDeleted();
    } catch (err) {
      toast({ title: 'Could not delete account', description: apiErrorMessage(err), variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2 items-start text-sm text-destructive">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <p>This will permanently delete your account, profile photo, and every conversation.</p>
      </div>
      <div>
        <Label htmlFor="del_pw">Password</Label>
        <Input id="del_pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="del_conf">Type "delete" to confirm</Label>
        <Input id="del_conf" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className="mt-1.5" autoCapitalize="off" autoComplete="off" />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Permanently delete account
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}

// =============================== Shared ===============================
function Section({ title, description, children, danger = false }) {
  return (
    <div className={`rounded-xl border p-5 sm:p-6 ${danger ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card'}`}>
      <h2 className={`font-semibold mb-1 ${danger ? 'text-destructive' : ''}`}>{title}</h2>
      {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
      {children}
    </div>
  );
}
