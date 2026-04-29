'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changePassword } from '@/lib/auth';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (newPassword.length < 8) {
      setErr('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      setErr('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      router.push('/dashboard');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto mt-20 max-w-sm rounded-2xl bg-white p-6 shadow">
      <h1 className="text-2xl font-semibold">Set a new password</h1>
      <p className="mt-2 text-sm text-shea-700">
        Choose a password you haven&apos;t used elsewhere. Minimum 8 characters.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm">Current password</span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-sm">Confirm new password</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 block w-full rounded-md border px-3 py-2"
          />
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-shea-700 py-2 text-white hover:bg-shea-900 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Update password'}
        </button>
      </form>
    </main>
  );
}
