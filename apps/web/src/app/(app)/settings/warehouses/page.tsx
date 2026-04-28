'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Pencil, Save, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: string;
  clerk_name: string | null;
  clerk_email: string | null;
}

interface WarehouseDetail extends Warehouse {
  clerk_phone: string | null;
  address: Record<string, unknown> | null;
}

interface Draft {
  clerk_name: string;
  clerk_email: string;
  clerk_phone: string;
}

export default function WarehouseSettingsPage() {
  const [list, setList] = useState<Warehouse[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ clerk_name: '', clerk_email: '', clerk_phone: '' });
  const [busy, setBusy] = useState(false);

  const reload = () =>
    api<Warehouse[]>('/warehouses')
      .then(setList)
      .catch((e) => { setList([]); toast.error('Failed to load warehouses', { description: e.message }); });

  useEffect(() => { reload(); }, []);

  const beginEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setDraft({
      clerk_name: w.clerk_name ?? '',
      clerk_email: w.clerk_email ?? '',
      clerk_phone: '', // PATCH endpoint accepts updates; phone isn't returned by list
    });
  };

  const cancelEdit = () => { setEditingId(null); };

  const save = async (id: string) => {
    setBusy(true);
    try {
      const body: Record<string, string | null> = {
        clerk_name: draft.clerk_name.trim() || null,
        clerk_email: draft.clerk_email.trim() || null,
      };
      if (draft.clerk_phone.trim()) body.clerk_phone = draft.clerk_phone.trim();
      await api<WarehouseDetail>(`/warehouses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      toast.success('Saved');
      setEditingId(null);
      await reload();
    } catch (e) {
      toast.error('Save failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-1 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-shea-700" />
        <h1 className="text-xl font-semibold">Warehouses</h1>
      </div>
      <p className="mb-4 text-sm text-shea-700">
        The clerk on file receives a fulfillment email each time an order is paid.
      </p>

      <ul className="grid grid-cols-1 gap-3">
        {list === null && Array.from({ length: 1 }).map((_, i) => (
          <li key={i} className="h-28 animate-pulse rounded-xl bg-white shadow" />
        ))}

        {list?.length === 0 && (
          <li className="rounded-xl bg-white p-8 text-center text-sm text-shea-700 shadow">
            No warehouses configured.
          </li>
        )}

        {list?.map((w) => {
          const editing = editingId === w.id;
          return (
            <li key={w.id} className="rounded-xl bg-white p-4 shadow">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{w.name}</div>
                  <div className="text-xs text-shea-700">
                    <span className="font-mono">{w.code}</span> · {w.type}
                  </div>
                </div>
                {!editing && (
                  <button
                    onClick={() => beginEdit(w)}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-shea-50"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit clerk
                  </button>
                )}
              </div>

              {!editing ? (
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                  <Field label="Clerk name" value={w.clerk_name} />
                  <Field label="Clerk email" value={w.clerk_email} mono />
                  <Field label="Status" value={w.clerk_email ? 'Active' : 'No clerk on file'} muted={!w.clerk_email} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Input
                    label="Clerk name"
                    value={draft.clerk_name}
                    onChange={(v) => setDraft((d) => ({ ...d, clerk_name: v }))}
                    placeholder="Don"
                  />
                  <Input
                    label="Clerk email"
                    type="email"
                    value={draft.clerk_email}
                    onChange={(v) => setDraft((d) => ({ ...d, clerk_email: v }))}
                    placeholder="ba2@brendamour.com"
                  />
                  <Input
                    label="Clerk phone"
                    value={draft.clerk_phone}
                    onChange={(v) => setDraft((d) => ({ ...d, clerk_phone: v }))}
                    placeholder="+1-513-247-0077 ext 15"
                  />
                  <div className="md:col-span-3 flex items-center justify-end gap-2">
                    <button
                      onClick={cancelEdit}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-shea-50 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" /> Cancel
                    </button>
                    <button
                      onClick={() => save(w.id)}
                      disabled={busy}
                      className="flex items-center gap-1 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-xs text-shea-700">
        Need to change the warehouse address or add another location? That requires a database
        migration today — full settings UI is on the roadmap.
      </p>
    </div>
  );
}

function Field({ label, value, mono, muted }: { label: string; value: string | null; mono?: boolean; muted?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-shea-700">{label}</div>
      <div className={[mono ? 'font-mono' : '', muted ? 'text-shea-700/60' : ''].join(' ')}>
        {value || <span className="text-shea-700/60">—</span>}
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, type = 'text', placeholder,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-xs uppercase tracking-wide text-shea-700">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border px-2 py-1.5 text-sm"
      />
    </label>
  );
}
