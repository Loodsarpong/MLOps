'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await signIn(email, password);
      router.push(r.must_change_password ? '/change-password' : '/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto mt-20 max-w-sm rounded-2xl bg-white p-6 shadow">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-shea-700 py-2 text-white hover:bg-shea-900 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
