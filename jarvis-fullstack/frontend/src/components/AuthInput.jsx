import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Themed input used inside AuthLayout cards.
 * - Dark-friendly colours that match the auth shell
 * - Optional leading icon
 * - For password fields, automatically renders a show/hide toggle
 */
export default function AuthInput({
  id, label, type = 'text', icon: Icon, value, onChange,
  placeholder, required = false, autoComplete, error, hint,
  ...rest
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-xs font-medium text-slate-300 mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500"
          />
        )}
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`w-full bg-slate-800/50 border ${
            error ? 'border-red-500/60' : 'border-slate-700 focus:border-cyan-400/60'
          } text-slate-100 placeholder:text-slate-500 rounded-lg ${
            Icon ? 'pl-9' : 'pl-3'
          } ${isPassword ? 'pr-10' : 'pr-3'} py-2.5 text-sm outline-none transition-colors focus:ring-2 focus:ring-cyan-400/20`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
            aria-label={revealed ? 'Hide password' : 'Show password'}
            tabIndex={-1}
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">{error}</p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}
