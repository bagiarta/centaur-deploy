import { useState } from "react";
import { Search, User, CreditCard, Wallet, Calendar, CheckCircle2, XCircle } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ui-enterprise";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function CrmLookupPage() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<any>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;

    try {
      setLoading(true);
      setCustomer(null);
      
      const res = await fetch(`/api/crm/customer/${phone}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Pencarian gagal");
      }

      setCustomer(data.data);
      toast.success("Data pelanggan ditemukan");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader 
        title="CRM Customer Lookup" 
        subtitle="Cari detail data pelanggan H2H CRM berdasarkan nomor telepon (MSISDN)"
      />

      <SectionCard>
        <form onSubmit={handleLookup} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Masukkan nomor telepon (contoh: 628...)"
              className="w-full pl-10 pr-3 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Searching..." : "Lookup"}
          </button>
        </form>
      </SectionCard>

      {customer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="lg:col-span-2 space-y-6">
            <div className="card-enterprise p-6 space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{customer.name || "N/A"}</h3>
                    <p className="text-sm text-foreground-muted">{customer.phone?.mobile || phone}</p>
                  </div>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
                  customer.active ? "bg-success-dim text-success" : "bg-danger-dim text-danger"
                )}>
                  {customer.active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {customer.active ? "Active" : "Inactive"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-foreground-muted">
                      <CreditCard className="w-4 h-4" />
                      <span>Barcode / Code</span>
                    </div>
                    <span className="text-sm font-mono font-medium">{customer.barcode || customer.code || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-foreground-muted">
                      <CreditCard className="w-4 h-4" />
                      <span>Card Type</span>
                    </div>
                    <span className="text-sm font-medium">{customer.card_type?.name || "-"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-foreground-muted">
                      <Calendar className="w-4 h-4" />
                      <span>Registered At</span>
                    </div>
                    <span className="text-sm font-medium">{customer.created_at || "-"}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-surface-raised border border-border">
                    <div className="flex items-center gap-2 text-sm text-foreground-muted">
                      <Wallet className="w-4 h-4" />
                      <span>Total Expense</span>
                    </div>
                    <span className="text-lg font-bold text-primary">
                      Rp {new Intl.NumberFormat('id-ID').format(customer.total_expense || 0)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border border-border bg-surface text-center">
                      <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">Redeem Points</p>
                      <p className="text-xl font-bold text-success">{customer.point?.redeem || 0}</p>
                    </div>
                    <div className="p-3 rounded-lg border border-border bg-surface text-center">
                      <p className="text-[10px] text-foreground-muted uppercase tracking-wider mb-1">Lucky Draw</p>
                      <p className="text-xl font-bold text-warning">{customer.point?.lucky_draw || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <SectionCard title="Full Response (JSON Debug)">
              <div className="max-h-96 overflow-auto bg-surface-raised p-4 rounded-lg border border-border">
                <pre className="text-[11px] font-mono text-foreground leading-relaxed">
                  {JSON.stringify(customer, null, 2)}
                </pre>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <div className="card-enterprise p-5 bg-primary/5 border-primary/20">
              <h4 className="text-sm font-semibold text-primary mb-3">Informasi Customer</h4>
              <p className="text-xs text-foreground-muted leading-relaxed">
                Data ini ditarik langsung dari sistem H2H CRM Pepito. Informasi poin dan total belanja sinkron secara real-time dengan transaksi POS.
              </p>
            </div>
          </div>
        </div>
      )}

      {!customer && !loading && phone && (
        <div className="card-enterprise p-10 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-surface-raised flex items-center justify-center text-foreground-muted mx-auto">
            <Search className="w-8 h-8" />
          </div>
          <p className="text-sm text-foreground-muted">Silakan tekan tombol 'Lookup' untuk mencari data.</p>
        </div>
      )}
    </div>
  );
}
