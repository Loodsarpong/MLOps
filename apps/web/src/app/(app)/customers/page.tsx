'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Users2, Plus, Pencil, X, Save, Search } from 'lucide-react';
import { api } from '@/lib/api';

type Segment = 'retail' | 'wholesale' | 'distributor' | 'online';

interface Customer {
  id: string;
  code: string;
  name: string;
  segment: Segment;
  email: string | null;
  phone: string | null;
  billing_address: Record<string, unknown> | null;
  shipping_address: Record<string, unknown> | null;
  tax_id: string | null;
  credit_limit: string;
  currency: string;
  is_active: boolean;
}

interface Draft {
  code: string;
  name: string;
  segment: Segment;
  email: string;
  phone: string;
  tax_id: string;
  credit_limit: string;
  currency: string;
  // Address fields collapsed into a flat shape; we'll JSON.stringify on save.
  billing_line1: string;
  billing_city: string;
  billing_state: string;
  billing_postal: string;
  billing_country: string;
}

const EMPTY: Draft = {
  code: '', name: '', segment: 'retail',
  email: '', phone: '', tax_id: '',
  credit_limit: '0', currency: 'USD',
  billing_line1: '', billing_city: '', billing_state: '',
  billing_postal: '', billing_country: 'US',
};

const SEGMENT_OPTIONS: Segment[] = ['retail', 'wholesale', 'distributor', 'online'];

export default function CustomersPage() {
  const [list, setList] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<Segment | ''>('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (segmentFilter) params.set('segment', segmentFilter);
    if (includeInactive) params.set('include_inactive', '1');
    const qs = params.toString();
    try {
      const rows = await api<Customer[]>(`/customers${qs ? `?${qs}` : ''}`);
      setList(rows);
    } catch (e) {
      setList([]);
      toast.error('Failed to load customers', { description: (e as Error).message });
    }
  };

  useEffect(() => {
    const timeout = setTimeout(reload, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, segmentFilter, includeInactive]);

  const beginCreate = () => {
    setDraft(EMPTY);
    setCreating(true);
    setEditing(null);
  };

  const beginEdit = (c: Customer) => {
    const a = (c.billing_address ?? {}) as Record<string, string>;
    setDraft({
      code: c.code, name: c.name, segment: c.segment,
      email: c.email ?? '', phone: c.phone ?? '', tax_id: c.tax_id ?? '',
      credit_limit: c.credit_limit, currency: c.currency,
      billing_line1: a.line1 ?? a.street ?? '',
      billing_city: a.city ?? '',
      billing_state: a.state ?? a.state_province ?? '',
      billing_postal: a.postal ?? a.postal_code ?? '',
      billing_country: a.country ?? a.country_code ?? 'US',
    });
    setEditing(c);
    setCreating(false);
  };

  const closePanel = () => { setEditing(null); setCreating(false); };

  const save = async () => {
    setBusy(true);
    try {
      const billing = (draft.billing_line1 || draft.billing_city)
        ? {
            line1: draft.billing_line1,
            city: draft.billing_city,
            state: draft.billing_state,
            postal: draft.billing_postal,
            country: draft.billing_country,
          }
        : null;
      const payload = {
        code: draft.code,
        name: draft.name,
        segment: draft.segment,
        email: draft.email || null,
        phone: draft.phone || null,
        tax_id: draft.tax_id || null,
        credit_limit: Number(draft.credit_limit) || 0,
        currency: draft.currency,
        billing_address: billing,
      };
      if (editing) {
        await api(`/customers/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success('Customer updated');
      } else {
        await api('/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Customer created');
      }
      closePanel();
      await reload();
    } catch (e) {
      toast.error('Save failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (c: Customer) => {
    try {
      if (c.is_active) {
        await api(`/customers/${c.id}`, { method: 'DELETE' });
      } else {
        await api(`/customers/${c.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: true }),
        });
      }
      await reload();
    } catch (e) {
      toast.error('Update failed', { description: (e as Error).message });
    }
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users2 className="h-5 w-5 text-shea-700" />
          <h1 className="text-xl font-semibold">Customers</h1>
        </div>
        <button
          onClick={beginCreate}
          className="flex items-center gap-1 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900"
        >
          <Plus className="h-4 w-4" /> New customer
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-shea-700" />
          <input
            placeholder="Search code, name, email, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border py-1.5 pl-8 pr-2 text-sm"
          />
        </div>
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value as Segment | '')}
          className="rounded-md border px-2 py-1.5 text-sm"
        >
          <option value="">All segments</option>
          {SEGMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-shea-700">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Include inactive
        </label>
      </div>

      {(creating || editing) && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          onCancel={closePanel}
          onSave={save}
          busy={busy}
          isEditing={!!editing}
        />
      )}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="border-b bg-shea-50">
            <tr className="text-left">
              <th className="p-3">Code</th>
              <th className="p-3">Name</th>
              <th className="p-3">Segment</th>
              <th className="p-3">Email</th>
              <th className="p-3">Phone</th>
              <th className="p-3 text-right">Credit limit</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list === null && (
              <tr><td colSpan={8} className="p-6 text-center text-shea-700">Loading…</td></tr>
            )}
            {list?.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-shea-700">
                {search ? `No customers match "${search}".` : 'No customers yet.'}
              </td></tr>
            )}
            {list?.map((c) => (
              <tr key={c.id} className={`border-b last:border-0 hover:bg-shea-50/50 ${!c.is_active ? 'opacity-50' : ''}`}>
                <td className="p-3 font-mono">{c.code}</td>
                <td className="p-3">{c.name}</td>
                <td className="p-3">
                  <span className="rounded-full bg-shea-100 px-2 py-0.5 text-xs text-shea-700">{c.segment}</span>
                </td>
                <td className="p-3 text-shea-700">{c.email ?? '—'}</td>
                <td className="p-3 text-shea-700">{c.phone ?? '—'}</td>
                <td className="p-3 text-right">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: c.currency }).format(Number(c.credit_limit))}
                </td>
                <td className="p-3">
                  {c.is_active ? <span className="text-green-700">Active</span> : <span className="text-red-600">Inactive</span>}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => beginEdit(c)} title="Edit" className="rounded p-1.5 hover:bg-shea-100">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(c)}
                      title={c.is_active ? 'Deactivate' : 'Reactivate'}
                      className="rounded px-2 py-1 text-xs hover:bg-shea-100"
                    >
                      {c.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
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

function Editor({
  draft, setDraft, onCancel, onSave, busy, isEditing,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  isEditing: boolean;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  return (
    <div className="mb-4 rounded-xl bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{isEditing ? 'Edit customer' : 'New customer'}</h2>
        <button onClick={onCancel} className="rounded p-1 hover:bg-shea-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="Code *" value={draft.code} onChange={(v) => set('code', v)} placeholder="CUST-1234" />
        <Input label="Name *" value={draft.name} onChange={(v) => set('name', v)} />
        <label className="block text-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-shea-700">Segment</div>
          <select
            value={draft.segment}
            onChange={(e) => set('segment', e.target.value as Segment)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          >
            {SEGMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <Input label="Email" value={draft.email} onChange={(v) => set('email', v)} type="email" />
        <Input label="Phone" value={draft.phone} onChange={(v) => set('phone', v)} />
        <Input label="Tax ID" value={draft.tax_id} onChange={(v) => set('tax_id', v)} />
        <Input label="Credit limit" value={draft.credit_limit} onChange={(v) => set('credit_limit', v)} type="number" />
        <Input label="Currency" value={draft.currency} onChange={(v) => set('currency', v)} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-3 text-xs uppercase tracking-wide text-shea-700">Billing address</div>
        <Input label="Street" value={draft.billing_line1} onChange={(v) => set('billing_line1', v)} />
        <Input label="City" value={draft.billing_city} onChange={(v) => set('billing_city', v)} />
        <Input label="State" value={draft.billing_state} onChange={(v) => set('billing_state', v)} />
        <Input label="Postal" value={draft.billing_postal} onChange={(v) => set('billing_postal', v)} />
        <Input label="Country" value={draft.billing_country} onChange={(v) => set('billing_country', v)} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-shea-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={busy || !draft.code || !draft.name}
          className="flex items-center gap-1 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create customer'}
        </button>
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
