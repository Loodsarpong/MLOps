'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users, Plus, KeyRound, UserX, UserCheck, Unlock } from 'lucide-react';
import { api } from '@/lib/api';

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  must_change_password: boolean;
  locked_until: string | null;
  last_login_at: string | null;
  roles: string[];
}

const ROLE_OPTIONS = ['admin', 'accountant', 'sales_rep', 'inventory_manager', 'cashier', 'viewer'];

export default function UsersSettingsPage() {
  const [list, setList] = useState<UserRow[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ email: '', full_name: '', phone: '', role_codes: ['cashier'] });
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api<UserRow[]>('/users')
      .then(setList)
      .catch((e) => { setList([]); toast.error('Failed to load users', { description: e.message }); });

  useEffect(() => { reload(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ email: string; temp_password?: string }>('/users', {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      if (r.temp_password) {
        toast.success(`User created`, {
          description: `Temp password: ${r.temp_password} (copy now — won't be shown again)`,
          duration: 30000,
        });
      } else {
        toast.success(`User ${r.email} created`);
      }
      setShowCreate(false);
      setDraft({ email: '', full_name: '', phone: '', role_codes: ['cashier'] });
      await reload();
    } catch (e) {
      toast.error('Create failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (u: UserRow) => {
    if (!confirm(`Reset password for ${u.email}? They will need to set a new one on next login.`)) return;
    try {
      const r = await api<{ temp_password: string }>(`/users/${u.id}/reset-password`, { method: 'POST' });
      toast.success(`Temp password for ${u.email}`, {
        description: r.temp_password + ' (copy now)',
        duration: 30000,
      });
    } catch (e) {
      toast.error('Reset failed', { description: (e as Error).message });
    }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      await reload();
    } catch (e) {
      toast.error('Update failed', { description: (e as Error).message });
    }
  };

  const unlock = async (u: UserRow) => {
    try {
      await api(`/users/${u.id}/unlock`, { method: 'POST' });
      toast.success(`Unlocked ${u.email}`);
      await reload();
    } catch (e) {
      toast.error('Unlock failed', { description: (e as Error).message });
    }
  };

  const isLocked = (u: UserRow) =>
    u.locked_until !== null && new Date(u.locked_until) > new Date();

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-shea-700" />
          <h1 className="text-xl font-semibold">Users</h1>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="flex items-center gap-1 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900"
        >
          <Plus className="h-4 w-4" /> New user
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 rounded-xl bg-white p-4 shadow">
          <h2 className="mb-3 text-sm font-semibold">Create user</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Email" value={draft.email} onChange={(v) => setDraft((d) => ({ ...d, email: v }))} type="email" />
            <Input label="Full name" value={draft.full_name} onChange={(v) => setDraft((d) => ({ ...d, full_name: v }))} />
            <Input label="Phone (optional)" value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} />
            <div>
              <div className="mb-1 text-xs uppercase tracking-wide text-shea-700">Roles</div>
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map((r) => {
                  const on = draft.role_codes.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          role_codes: on
                            ? d.role_codes.filter((x) => x !== r)
                            : [...d.role_codes, r],
                        }))
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        on ? 'bg-shea-700 text-white' : 'hover:bg-shea-50'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-shea-50">
              Cancel
            </button>
            <button
              onClick={create}
              disabled={busy || !draft.email || !draft.full_name}
              className="rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="border-b bg-shea-50">
            <tr className="text-left">
              <th className="p-3">Email</th>
              <th className="p-3">Name</th>
              <th className="p-3">Roles</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last login</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list === null && (
              <tr><td colSpan={6} className="p-6 text-center text-shea-700">Loading…</td></tr>
            )}
            {list?.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-shea-700">No users yet.</td></tr>
            )}
            {list?.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-shea-50/50">
                <td className="p-3 font-mono">{u.email}</td>
                <td className="p-3">{u.full_name}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r} className="rounded-full bg-shea-100 px-2 py-0.5 text-xs text-shea-700">
                        {r}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-3">
                  {isLocked(u) ? (
                    <span className="text-amber-700">Locked</span>
                  ) : !u.is_active ? (
                    <span className="text-red-600">Inactive</span>
                  ) : u.must_change_password ? (
                    <span className="text-blue-700">Pending password</span>
                  ) : (
                    <span className="text-green-700">Active</span>
                  )}
                </td>
                <td className="p-3 text-shea-700">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    {isLocked(u) && (
                      <IconButton title="Unlock" onClick={() => unlock(u)}>
                        <Unlock className="h-4 w-4" />
                      </IconButton>
                    )}
                    <IconButton title="Reset password" onClick={() => resetPassword(u)}>
                      <KeyRound className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title={u.is_active ? 'Deactivate' : 'Reactivate'}
                      onClick={() => toggleActive(u)}
                    >
                      {u.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-xs uppercase tracking-wide text-shea-700">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="rounded p-1.5 hover:bg-shea-100">
      {children}
    </button>
  );
}
