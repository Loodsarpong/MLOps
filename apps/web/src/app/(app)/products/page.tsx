'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Package, Plus, Pencil, X, Save, Search } from 'lucide-react';
import { api } from '@/lib/api';

interface Product {
  id: string;
  sku: string;
  upc: string | null;
  name: string;
  description: string | null;
  category: string | null;
  uom: string;
  is_tracked_by_batch: boolean;
  tax_rate_pct: string;
  cost_price: string;
  base_price: string;
  currency: string;
  weight_grams: string | null;
  is_active: boolean;
}

interface DraftProduct {
  sku: string;
  upc: string;
  name: string;
  description: string;
  category: string;
  uom: string;
  is_tracked_by_batch: boolean;
  tax_rate_pct: string;
  cost_price: string;
  base_price: string;
  currency: string;
  weight_grams: string;
}

const EMPTY_DRAFT: DraftProduct = {
  sku: '', upc: '', name: '', description: '', category: '', uom: 'unit',
  is_tracked_by_batch: true,
  tax_rate_pct: '0', cost_price: '0', base_price: '0', currency: 'USD',
  weight_grams: '',
};

const fmtMoney = (currency: string, val: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(val));

export default function ProductsPage() {
  const [list, setList] = useState<Product[] | null>(null);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (includeInactive) params.set('include_inactive', '1');
    const qs = params.toString();
    try {
      const rows = await api<Product[]>(`/products${qs ? `?${qs}` : ''}`);
      setList(rows);
    } catch (e) {
      setList([]);
      toast.error('Failed to load products', { description: (e as Error).message });
    }
  };

  useEffect(() => {
    const timeout = setTimeout(reload, 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, includeInactive]);

  const beginCreate = () => {
    setDraft(EMPTY_DRAFT);
    setCreating(true);
    setEditing(null);
  };

  const beginEdit = (p: Product) => {
    setDraft({
      sku: p.sku,
      upc: p.upc ?? '',
      name: p.name,
      description: p.description ?? '',
      category: p.category ?? '',
      uom: p.uom,
      is_tracked_by_batch: p.is_tracked_by_batch,
      tax_rate_pct: p.tax_rate_pct,
      cost_price: p.cost_price,
      base_price: p.base_price,
      currency: p.currency,
      weight_grams: p.weight_grams ?? '',
    });
    setEditing(p);
    setCreating(false);
  };

  const closePanel = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        sku: draft.sku,
        upc: draft.upc || null,
        name: draft.name,
        description: draft.description || null,
        category: draft.category || null,
        uom: draft.uom,
        is_tracked_by_batch: draft.is_tracked_by_batch,
        tax_rate_pct: Number(draft.tax_rate_pct),
        cost_price: Number(draft.cost_price),
        base_price: Number(draft.base_price),
        currency: draft.currency,
        weight_grams: draft.weight_grams ? Number(draft.weight_grams) : null,
      };
      if (editing) {
        await api(`/products/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        toast.success('Product updated');
      } else {
        await api('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('Product created');
      }
      closePanel();
      await reload();
    } catch (e) {
      toast.error('Save failed', { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p: Product) => {
    try {
      if (p.is_active) {
        await api(`/products/${p.id}`, { method: 'DELETE' });
      } else {
        await api(`/products/${p.id}`, {
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
          <Package className="h-5 w-5 text-shea-700" />
          <h1 className="text-xl font-semibold">Products</h1>
        </div>
        <button
          onClick={beginCreate}
          className="flex items-center gap-1 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900"
        >
          <Plus className="h-4 w-4" /> New product
        </button>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-shea-700" />
          <input
            placeholder="Search SKU, name, or UPC"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border py-1.5 pl-8 pr-2 text-sm"
          />
        </div>
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
              <th className="p-3">SKU</th>
              <th className="p-3">Name</th>
              <th className="p-3">Category</th>
              <th className="p-3">UoM</th>
              <th className="p-3 text-right">Cost</th>
              <th className="p-3 text-right">Price</th>
              <th className="p-3 text-right">Tax %</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list === null && (
              <tr><td colSpan={9} className="p-6 text-center text-shea-700">Loading…</td></tr>
            )}
            {list?.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-shea-700">
                {search ? `No products match "${search}".` : 'No products yet.'}
              </td></tr>
            )}
            {list?.map((p) => (
              <tr key={p.id} className={`border-b last:border-0 hover:bg-shea-50/50 ${!p.is_active ? 'opacity-50' : ''}`}>
                <td className="p-3 font-mono">{p.sku}</td>
                <td className="p-3">{p.name}</td>
                <td className="p-3 text-shea-700">{p.category ?? '—'}</td>
                <td className="p-3 text-shea-700">{p.uom}</td>
                <td className="p-3 text-right">{fmtMoney(p.currency, p.cost_price)}</td>
                <td className="p-3 text-right font-medium">{fmtMoney(p.currency, p.base_price)}</td>
                <td className="p-3 text-right text-shea-700">{Number(p.tax_rate_pct).toFixed(2)}%</td>
                <td className="p-3">
                  {p.is_active ? <span className="text-green-700">Active</span> : <span className="text-red-600">Inactive</span>}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => beginEdit(p)}
                      title="Edit"
                      className="rounded p-1.5 hover:bg-shea-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      title={p.is_active ? 'Deactivate' : 'Reactivate'}
                      className="rounded px-2 py-1 text-xs hover:bg-shea-100"
                    >
                      {p.is_active ? 'Deactivate' : 'Reactivate'}
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
  draft: DraftProduct;
  setDraft: (d: DraftProduct) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
  isEditing: boolean;
}) {
  const set = <K extends keyof DraftProduct>(k: K, v: DraftProduct[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <div className="mb-4 rounded-xl bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{isEditing ? 'Edit product' : 'New product'}</h2>
        <button onClick={onCancel} className="rounded p-1 hover:bg-shea-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input label="SKU *" value={draft.sku} onChange={(v) => set('sku', v)} />
        <Input label="Name *" value={draft.name} onChange={(v) => set('name', v)} />
        <Input label="UPC" value={draft.upc} onChange={(v) => set('upc', v)} />
        <Input label="Category" value={draft.category} onChange={(v) => set('category', v)} />
        <Input label="Unit of measure *" value={draft.uom} onChange={(v) => set('uom', v)} placeholder="unit, kg, case" />
        <Input label="Currency" value={draft.currency} onChange={(v) => set('currency', v)} />
        <Input label="Cost price" value={draft.cost_price} onChange={(v) => set('cost_price', v)} type="number" />
        <Input label="Sell price" value={draft.base_price} onChange={(v) => set('base_price', v)} type="number" />
        <Input label="Tax rate (%)" value={draft.tax_rate_pct} onChange={(v) => set('tax_rate_pct', v)} type="number" />
        <Input label="Weight (g)" value={draft.weight_grams} onChange={(v) => set('weight_grams', v)} type="number" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.is_tracked_by_batch}
            onChange={(e) => set('is_tracked_by_batch', e.target.checked)}
          />
          Batch-tracked
        </label>
      </div>
      <div className="mt-2">
        <Input
          label="Description"
          value={draft.description}
          onChange={(v) => set('description', v)}
          multiline
        />
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
          disabled={busy || !draft.sku || !draft.name || !draft.uom}
          className="flex items-center gap-1 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, type = 'text', placeholder, multiline,
}: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; multiline?: boolean }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-xs uppercase tracking-wide text-shea-700">{label}</div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full rounded-md border px-2 py-1.5 text-sm"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border px-2 py-1.5 text-sm"
        />
      )}
    </label>
  );
}
