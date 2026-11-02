import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useToast } from '../lib/store';
import api from '../lib/api';
import { Field, LogoMark } from '../components/UI';

export default function SignIn() {
  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '', pin: '' });
  const [searchParams] = useSearchParams();
  const [forgot, setForgot] = useState(Boolean(searchParams.get('token')));
  const [resetToken, setResetToken] = useState(searchParams.get('token') || '');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(form.email, form.password, form.pin);
      toast.ok(`Signed in as ${user.full_name}`);
      navigate(location.state?.from || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const requestReset = async (e) => {
    e.preventDefault(); setError(null);
    try { const result = await api.auth.forgotPassword({ email: form.email }); if (result.resetToken) setResetToken(result.resetToken); toast.ok(result.message); }
    catch (err) { setError(err.message); }
  };
  const completeReset = async (e) => {
    e.preventDefault(); setError(null);
    try { const result = await api.auth.resetPassword({ token: resetToken, newPassword }); toast.ok(result.message); setForgot(false); setResetToken(''); setNewPassword(''); }
    catch (err) { setError(err.message); }
  };

  return (
    <div className="wrap" style={{ maxWidth: 940 }}>
      <div className="split-wide" style={{ gridTemplateColumns: '1fr 320px', marginTop: '2rem' }}>
        <div className="card" style={{ padding: '2.25rem' }}>
          <LogoMark size={38} />
          <h1 style={{ fontSize: 'var(--step-3)', marginTop: '1rem' }}>Welcome back</h1>
          <p className="muted">Sign in to publish, review requests and manage your marketplace listings.</p>

          {error && <div className="notice notice-error" style={{ marginBottom: '1rem' }}>{error}</div>}

          {forgot ? (
            <form onSubmit={resetToken ? completeReset : requestReset} noValidate>
              {!resetToken ? <Field label="Account email" required><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field> : <><Field label="Reset token" required><input className="input" required value={resetToken} onChange={(e) => setResetToken(e.target.value)} /></Field><Field label="New password" required><input className="input" type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field></>}
              <button className="btn btn-primary btn-block">{resetToken ? 'Reset password' : 'Request reset'}</button>
              <button type="button" className="btn btn-quiet btn-block" onClick={() => { setForgot(false); setError(null); }}>Back to sign in</button>
            </form>
          ) : <form onSubmit={submit} noValidate>
            <Field label="Email" required>
              <input
                className="input" type="email" autoComplete="email" required
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Password" required>
              <input
                className="input" type="password" autoComplete="current-password" required
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Field label="Security PIN" required hint="Enter the 4–8 digit PIN you set during registration"><input className="input" type="password" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></Field>
            <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>}
          {!forgot && <button type="button" className="btn btn-quiet btn-sm" style={{ marginTop: '0.8rem' }} onClick={() => { setForgot(true); setError(null); }}>Forgot password?</button>}

          <p className="small muted" style={{ marginTop: '1.25rem', marginBottom: 0 }}>
            No account yet? <Link to="/register">Create one</Link> — every new account starts on the Basic plan.
          </p>
        </div>
      </div>
    </div>
  );
}
