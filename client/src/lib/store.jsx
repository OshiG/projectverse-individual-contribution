import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { tokenStore } from './api';

/* ------------------------------------------------------------ formatting */
export const money = (n, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n || 0));

export const num = (n) => new Intl.NumberFormat('en-US').format(Number(n || 0));

export const date = (d, opts = {}) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...opts }) : '—';

export const dateTime = (d) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function timeAgo(d) {
  if (!d) return '';
  const secs = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month']];
  let value = secs;
  let unit = 'second';
  for (const [size, name] of steps) {
    if (Math.abs(value) < size) { unit = name; break; }
    value = Math.round(value / size);
    unit = name;
  }
  if (unit === 'second' && Math.abs(value) < 45) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  return rtf.format(-value, unit);
}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export const titleCase = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/* ---------------------------------------------------------------- auth */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) { setUser(null); setLoading(false); return null; }
    try {
      const { user: me } = await api.auth.me();
      setUser(me);
      return me;
    } catch {
      tokenStore.clear();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onSignedOut = () => setUser(null);
    window.addEventListener('pv:signed-out', onSignedOut);
    return () => window.removeEventListener('pv:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (email, password, pin) => {
    const { token, user: me } = await api.auth.login({ email, password, pin });
    tokenStore.set(token);
    setUser(me);
    return me;
  }, []);

  const signUp = useCallback(async (payload) => {
    const { token, user: me } = await api.auth.register(payload);
    tokenStore.set(token);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      signUp,
      signOut,
      refresh,
      isPremium: user?.plan_code === 'premium',
      isPublisher: ['student', 'researcher'].includes(user?.role_code),
      isSeeker: ['business', 'investor'].includes(user?.role_code),
    }),
    [user, loading, signIn, signUp, signOut, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};

/* --------------------------------------------------------------- toasts */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, tone = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(
    () => ({
      toast: push,
      ok: (m) => push(m, 'ok'),
      error: (m) => push(m, 'error'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-tray" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'ok' ? 'toast-ok' : t.tone === 'error' ? 'toast-error' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
};

/* ------------------------------------------------------- data fetching */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fn());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (immediate) run(); }, [run, immediate]);

  return { data, error, loading, reload: run, setData };
}
