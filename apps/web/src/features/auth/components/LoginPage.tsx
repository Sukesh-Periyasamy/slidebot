import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

import { useAuth } from '../hooks/useAuth';
import { useRedirectIfAuthenticated } from '../hooks/useRequireAuth';

// ─────────────────────────────────────────────────────────────────────────────
// Login Page
// ─────────────────────────────────────────────────────────────────────────────

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo');
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('/login')
      ? rawReturnTo
      : '/dashboard';

  useRedirectIfAuthenticated(returnTo);

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const { signInWithEmail, signUpWithEmail, signInWithGoogle, error } = useAuth();

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        const { error: err } = await signInWithEmail(email, password);
        if (err) setMessage({ type: 'error', text: err });
      } else {
        const { error: err } = await signUpWithEmail(email, password, displayName);
        if (err) {
          setMessage({ type: 'error', text: err });
        } else {
          setMessage({
            type: 'success',
            text: 'Check your email to confirm your account.',
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setMessage(null);
    const { error: err } = await signInWithGoogle();
    if (err) setMessage({ type: 'error', text: err });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen gradient-mesh">
      {/* Left panel — branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 shadow-glow-sm">
            <SlideBotLogo />
          </div>
          <span className="text-lg font-semibold text-slate-900">SlideBot</span>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight text-slate-900">
            Figma for{' '}
            <span className="bg-gradient-to-r from-brand-500 to-purple-500 bg-clip-text text-transparent">
              live presentations
            </span>
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed max-w-md">
            Synchronized multiplayer presentations. Live cursors, real-time annotations, presenter
            handoff — all with sub-50ms latency.
          </p>

          {/* Feature list */}
          <ul className="space-y-3">
            {[
              'Multiplayer slide navigation',
              'Real-time annotations & cursors',
              'Instant presenter handoff',
              'Personal exploration mode',
              'Chrome Extension for Google Meet',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-slate-600">
                <div className="h-5 w-5 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="#6173f2"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-slate-400">
          © {new Date().getFullYear()} SlideBot. Built for collaborative teams.
        </p>
      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
        >
          {/* Card */}
          <div className="glass-light rounded-2xl p-8">
            {/* Header */}
            <div className="mb-8 text-center lg:text-left">
              <div className="flex lg:hidden items-center justify-center gap-2 mb-6">
                <div className="h-8 w-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-glow-sm">
                  <SlideBotLogo />
                </div>
                <span className="font-semibold text-slate-900">SlideBot</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="mt-1 text-slate-500 text-sm">
                {mode === 'signin'
                  ? 'Sign in to your SlideBot workspace'
                  : 'Start collaborating in minutes'}
              </p>
            </div>

            {/* Google OAuth button */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-gray-50 hover:border-gray-300 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-slate-400">or</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label
                    htmlFor="displayName"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    Display Name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    required={mode === 'signup'}
                    className="auth-input"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  className="auth-input"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  required
                  minLength={mode === 'signup' ? 8 : 1}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="auth-input"
                />
              </div>

              {/* Error / Success message */}
              {message && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={`rounded-lg px-4 py-3 text-sm ${
                    message.type === 'error'
                      ? 'bg-red-50 border border-red-200 text-red-600'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-600'
                  }`}
                >
                  {message.text}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-glow-sm transition-all hover:bg-brand-600 hover:shadow-glow-brand focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            {/* Mode toggle */}
            <p className="mt-6 text-center text-sm text-slate-500">
              {mode === 'signin' ? (
                <>
                  No account?{' '}
                  <button
                    onClick={() => {
                      setMode('signup');
                      setMessage(null);
                    }}
                    className="text-brand-500 hover:text-brand-600 font-medium"
                  >
                    Sign up free
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => {
                      setMode('signin');
                      setMessage(null);
                    }}
                    className="text-brand-500 hover:text-brand-600 font-medium"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            By continuing, you agree to our{' '}
            <Link to="/terms" className="text-slate-500 hover:text-brand-500 transition-colors">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-slate-500 hover:text-brand-500 transition-colors">
              Privacy Policy
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Inline styles for auth input (DRY) */}
      <style>{`
        .auth-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(229 231 235);
          background: #ffffff;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .auth-input::placeholder { color: rgb(148 163 184); }
        .auth-input:focus {
          border-color: rgb(97 115 242 / 0.6);
          box-shadow: 0 0 0 3px rgb(97 115 242 / 0.1);
        }
        .auth-input:hover:not(:focus) {
          border-color: rgb(209 213 219);
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Callback Page (handles OAuth redirect)
// ─────────────────────────────────────────────────────────────────────────────

export function AuthCallbackPage() {
  // Supabase client automatically handles the OAuth code exchange
  // via detectSessionInUrl: true in the client config.
  // This page just renders while the session is being resolved.
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <p className="text-sm text-slate-500">Completing sign in...</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

function SlideBotLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.9" />
      <rect x="6" y="8" width="8" height="1.5" rx="0.75" fill="#6173F2" />
      <rect x="6" y="11" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.6" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
