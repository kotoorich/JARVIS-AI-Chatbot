import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, User, AtSign, UserPlus, Loader2, Check } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import AuthInput from '@/components/AuthInput';
import { useAuth } from '@/lib/AuthContext';

export default function Register() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  const checks = useMemo(() => ({
    length: password.length >= 8,
    letter: /[A-Za-z]/.test(password),
    digit: /\d/.test(password),
    match: !!password && password === confirm,
  }), [password, confirm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!checks.length || !checks.letter || !checks.digit) {
      return setError('Please meet all password requirements');
    }
    if (!checks.match) return setError('Passwords do not match');

    setLoading(true);
    const result = await register({
      email: email.trim(),
      password,
      full_name: fullName.trim() || null,
      username: username.trim() || null,
    });
    if (!result.success) {
      setError(result.error);
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Join JARVIS and start chatting with your own AI assistant."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-cyan-300 hover:text-cyan-200 font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
        {error && (
          <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <AuthInput id="full_name" label="Full name" icon={User}
          value={fullName} onChange={setFullName} placeholder="Tony Stark"
          autoComplete="name"
        />

        <AuthInput id="username" label="Username (optional)" icon={AtSign}
          value={username} onChange={setUsername} placeholder="tony_stark"
          autoComplete="username"
          hint="3–32 chars; letters, numbers, dot, underscore, dash."
        />

        <AuthInput id="email" label="Email" type="email" icon={Mail}
          value={email} onChange={setEmail} placeholder="you@example.com"
          required autoComplete="email"
        />

        <AuthInput id="password" label="Password" type="password" icon={Lock}
          value={password} onChange={setPassword} placeholder="••••••••"
          required autoComplete="new-password"
        />

        {/* Live password strength checklist */}
        {password.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <Requirement met={checks.length} label="At least 8 characters" />
            <Requirement met={checks.letter} label="Includes a letter" />
            <Requirement met={checks.digit} label="Includes a number" />
            <Requirement met={checks.match} label="Matches confirmation" />
          </ul>
        )}

        <AuthInput id="confirm" label="Confirm password" type="password" icon={Lock}
          value={confirm} onChange={setConfirm} placeholder="••••••••"
          required autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-semibold py-2.5 text-sm shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 hover:from-cyan-400 hover:to-cyan-300 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <UserPlus className="h-4 w-4" />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-[11px] text-center text-slate-500">
          By signing up you agree to be excellent and to not break things.
        </p>
      </form>
    </AuthLayout>
  );
}

function Requirement({ met, label }) {
  return (
    <li className={`flex items-center gap-1.5 ${met ? 'text-cyan-300' : 'text-slate-500'}`}>
      <span className={`inline-flex items-center justify-center h-3.5 w-3.5 rounded-full border ${
        met ? 'border-cyan-300 bg-cyan-300/20' : 'border-slate-600'
      }`}>
        {met && <Check className="h-2.5 w-2.5" />}
      </span>
      {label}
    </li>
  );
}
