import { useCallback, useEffect, useState } from 'react';
import { Save, Search, Factory } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

type Item = {
  item_code: string;
  item_name: string;
  production_flag: string;
  production_label: string;
  updated_date?: string;
  updated_time?: string;
};

type HistoryRow = {
  id: number;
  item_code: string;
  item_name: string;
  old_flag: string;
  new_flag: string;
  old_label: string;
  new_label: string;
  changed_by?: string;
  changed_by_name?: string;
  changed_at: string;
};

const flagOptions = [
  { value: '0', label: 'Regular' },
  { value: '1', label: 'Production' },
  { value: '2', label: 'Preproduction' },
];

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('id-ID') : '-';

export default function ProductionFlagPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const loadHistory = useCallback(async (itemCode: string) => {
    if (!itemCode) {
      setHistory([]);
      return;
    }
    try {
      const response = await fetch(`/api/support/production-flags/history?item_code=${encodeURIComponent(itemCode)}`);
      const data = await response.json().catch(() => []);
      if (response.ok) setHistory(data);
    } catch {
      // History is supplementary; keep the item form usable if it is unavailable.
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/support/production-flags?search=${encodeURIComponent(search)}`);
      const data = await response.json().catch(() => []);
      if (!response.ok) throw new Error(data.error || 'Gagal mengambil data item.');
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengambil data item.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadItems(), 300);
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  useEffect(() => {
    loadHistory(selectedItem?.item_code || '');
  }, [loadHistory, selectedItem?.item_code]);

  const updateFlag = async (item: Item) => {
    setSaving(item.item_code);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/support/production-flags/${encodeURIComponent(item.item_code)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          production_flag: item.production_flag,
          changed_by: user?.username || 'SYSTEM',
          changed_by_name: user?.full_name || user?.username || 'SYSTEM',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Gagal memperbarui production flag.');
      setItems(current => current.map(row => row.item_code === item.item_code ? data.item : row));
      setSelectedItem(data.item);
      setMessage(`Production flag ${item.item_code} berhasil diperbarui.`);
      await loadHistory(item.item_code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui production flag.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary"><Factory className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-bold">Item Production Flag</h1>
            <p className="text-sm text-foreground-muted">Tools untuk update production flag item.</p>
          </div>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">{error}</div>}
      {message && <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">{message}</div>}

      <div className="max-w-3xl rounded-xl border border-border bg-surface p-5 space-y-5">
        <div>
          <label className="block text-sm font-bold mb-2">Pilih Item</label>
          <p className="text-xs text-foreground-muted mb-3">Ketik item code atau nama item, lalu pilih satu hasil pencarian.</p>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-foreground-muted" />
            <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm" placeholder="Cari item..." value={search} onChange={e => { setSearch(e.target.value); setSelectedItem(null); }} aria-label="Cari item" />
            {search && !selectedItem && (
              <div className="absolute z-10 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                {loading && <div className="px-3 py-3 text-sm text-foreground-muted">Mencari item...</div>}
                {!loading && items.map(item => (
                  <button type="button" key={item.item_code} onClick={() => { setSelectedItem(item); setSearch(item.item_code); }} className="w-full text-left px-3 py-2.5 hover:bg-surface-raised border-b border-border last:border-b-0">
                    <span className="block font-mono text-xs font-bold">{item.item_code}</span>
                    <span className="block text-sm">{item.item_name || '-'}</span>
                  </button>
                ))}
                {!loading && items.length === 0 && <div className="px-3 py-3 text-sm text-foreground-muted">Item tidak ditemukan.</div>}
              </div>
            )}
          </div>
        </div>

        {selectedItem ? (
          <div className="space-y-4 border-t border-border pt-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><span className="block text-xs text-foreground-muted">Item Code</span><span className="font-mono font-bold">{selectedItem.item_code}</span></div>
              <div><span className="block text-xs text-foreground-muted">Deskripsi Item</span><span className="font-medium">{selectedItem.item_name || '-'}</span></div>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">Production Flag</label>
              <select className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" value={String(selectedItem.production_flag)} onChange={e => setSelectedItem({ ...selectedItem, production_flag: e.target.value, production_label: flagOptions.find(option => option.value === e.target.value)?.label || '' })}>
                {flagOptions.map(option => <option key={option.value} value={option.value}>{option.value} - {option.label}</option>)}
              </select>
              <p className="text-xs text-foreground-muted mt-2">0 = Regular, 1 = Production, 2 = Preproduction</p>
            </div>
            <div className="text-xs text-foreground-muted">Last updated: {formatDate(selectedItem.updated_date)} {selectedItem.updated_time || '-'}</div>
            <button disabled={saving === selectedItem.item_code} onClick={() => updateFlag(selectedItem)} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"><Save className="w-4 h-4" />{saving === selectedItem.item_code ? 'Saving...' : 'Update Production Flag'}</button>
          </div>
        ) : (
          <div className="border-t border-border pt-5 text-sm text-foreground-muted">Belum ada item yang dipilih.</div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold">History Perubahan Production Flag</h2>
          <p className="text-xs text-foreground-muted mt-1">{selectedItem ? `Perubahan untuk item ${selectedItem.item_code}.` : 'Pilih item untuk melihat history perubahannya.'}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-raised text-xs uppercase text-foreground-muted">
              <tr><th className="text-left px-4 py-3">Waktu</th><th className="text-left px-4 py-3">Item</th><th className="text-left px-4 py-3">Perubahan</th><th className="text-left px-4 py-3">Oleh</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map(row => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-xs text-foreground-muted">{new Date(row.changed_at).toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3"><span className="font-mono font-bold">{row.item_code}</span><span className="block text-xs text-foreground-muted">{row.item_name || '-'}</span></td>
                  <td className="px-4 py-3"><span className="font-bold">{row.old_flag} - {row.old_label}</span><span className="mx-2 text-foreground-muted">→</span><span className="font-bold text-primary">{row.new_flag} - {row.new_label}</span></td>
                  <td className="px-4 py-3">{row.changed_by_name || row.changed_by || 'SYSTEM'}<span className="block text-xs text-foreground-muted">{row.changed_by || ''}</span></td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-foreground-muted">{selectedItem ? 'Belum ada history untuk item ini.' : 'Pilih item terlebih dahulu.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
