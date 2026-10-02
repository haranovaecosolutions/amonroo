"use client";

import { FormEvent, useState } from 'react';
import { LockKeyhole } from 'lucide-react';

function safeNextPath() {
  const next = new URLSearchParams(window.location.search).get('next');
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Could not verify password.');
        return;
      }
      window.location.assign(safeNextPath());
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-page">
    <section className="card login-card">
      <div className="login-mark"><LockKeyhole size={20} /></div>
      <div className="eyebrow">Amonroo Inventory</div>
      <h1>Enter password</h1>
      <p className="muted">Enter the site password to continue.</p>
      <form className="login-form" onSubmit={login}>
        <label htmlFor="site-password">Password</label>
        <div className="login-password">
          <input
            autoComplete="current-password"
            autoFocus
            id="site-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type={showPassword ? 'text' : 'password'}
            value={password}
          />
          <button
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            className="login-password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            type="button"
          >
            {showPassword ? 'Hide password' : 'Show password'}
          </button>
        </div>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button" disabled={loading} type="submit">
          {loading ? 'Checking...' : 'Unlock website'}
        </button>
      </form>
    </section>
  </main>;
}
