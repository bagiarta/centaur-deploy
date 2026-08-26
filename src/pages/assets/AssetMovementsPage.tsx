import React, { useState, useEffect } from 'react';
import { PageHeader, SectionCard } from '@/components/ui-enterprise';
import { Search, Plus, Map, ArrowRightLeft, FileText, CheckCircle2, XCircle, Clock, MoreHorizontal, Check, X, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { assetApi } from '@/lib/api-assets';

export default function AssetMovementsPage() {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [formData, setFormData] = useState({ 
    asset_code: '', request_type: 'TRANSFER', from_location: '', to_location: '', reason: '', requested_by: '' 
  });

  const fetchData = async () => {
    try {
      const [movData, assetData, locData] = await Promise.all([
        assetApi.getMovements(),
        assetApi.getAssets(),
        assetApi.getLocations()
      ]);
      setMovements(movData);
      setAssets(assetData);
      setLocations(locData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredMovements = movements.filter(m => 
    m.asset_code?.toLowerCase().includes(search.toLowerCase()) || 
    m.requested_by?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assetApi.createMovement(formData);
      setIsModalOpen(false);
      setFormData({ asset_code: '', request_type: 'TRANSFER', from_location: '', to_location: '', reason: '', requested_by: '' });
      fetchData();
    } catch (err) {
      alert("Failed to create movement request.");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this movement record?")) {
      try {
        await assetApi.deleteMovement(id);
        fetchData();
      } catch (err) {
        alert("Failed to delete movement.");
      }
    }
  };
  
  const handleApprove = async (id: number) => {
    try {
      await assetApi.updateMovement(id, { status: 'APPROVED', approved_by: 'Admin', approval_date: new Date().toISOString() });
      fetchData();
    } catch (err) {
      alert("Failed to approve movement.");
    }
  }

  const handleReject = async (id: number) => {
    try {
      await assetApi.updateMovement(id, { status: 'REJECTED', approved_by: 'Admin', approval_date: new Date().toISOString() });
      fetchData();
    } catch (err) {
      alert("Failed to reject movement.");
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader 
        title="Asset Movements" 
        subtitle="Manage transfer, disposal, and return requests across locations."
      />

      <SectionCard>
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search asset or requester..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-primary transition-all"
            />
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <button className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                New Request
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>New Movement Request</DialogTitle>
                <DialogDescription>
                  Request to transfer, return, or dispose an asset.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Request Type</label>
                  <select required value={formData.request_type} onChange={e => setFormData({...formData, request_type: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="TRANSFER">TRANSFER (Location to Location)</option>
                    <option value="RETURN">RETURN (To IT/Store)</option>
                    <option value="DISPOSAL">DISPOSAL (Write-off)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asset Code</label>
                  <select required value={formData.asset_code} onChange={e => setFormData({...formData, asset_code: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="">-- Choose Asset --</option>
                    {assets.map(a => <option key={a.asset_code} value={a.asset_code}>{a.asset_name} ({a.asset_code})</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">From Location</label>
                    <select required value={formData.from_location} onChange={e => setFormData({...formData, from_location: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                      <option value="">-- Optional --</option>
                      {locations.map(l => <option key={l.location_code} value={l.location_code}>{l.location_name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">To Location</label>
                    <select required value={formData.to_location} onChange={e => setFormData({...formData, to_location: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                      <option value="">-- Optional --</option>
                      {locations.map(l => <option key={l.location_code} value={l.location_code}>{l.location_name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Requested By</label>
                  <input required value={formData.requested_by} onChange={e => setFormData({...formData, requested_by: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. Jane Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason</label>
                  <textarea required value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full p-2 border rounded-md min-h-[60px]" placeholder="Reason for movement..." />
                </div>
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Submit Request</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset Info</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type & Route</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requester</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMovements.map(mov => (
                <tr key={mov.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="p-3">
                    <div className="font-medium text-sm">{mov.asset_code}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(mov.request_date).toLocaleDateString()}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold">{mov.request_type}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{mov.from_location || '-'}</span>
                        <ArrowRightLeft className="w-3 h-3 shrink-0" />
                        <span>{mov.to_location || '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-sm">{mov.requested_by}</td>
                  <td className="p-3">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max",
                      mov.status === 'APPROVED' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : 
                      mov.status === 'REJECTED' ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}>
                      {mov.status === 'APPROVED' ? <CheckCircle2 className="w-3 h-3" /> : 
                       mov.status === 'REJECTED' ? <XCircle className="w-3 h-3" /> : 
                       <Clock className="w-3 h-3" />}
                      {mov.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors outline-none focus:ring-2 focus:ring-primary">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Manage Request</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {mov.status === 'PENDING' && (
                          <>
                            <DropdownMenuItem onClick={() => handleApprove(mov.id)} className="cursor-pointer text-green-600 focus:text-green-600 focus:bg-green-100 dark:focus:bg-green-900/30">
                              <Check className="w-4 h-4 mr-2" /> Approve Request
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleReject(mov.id)} className="cursor-pointer text-amber-600 focus:text-amber-600 focus:bg-amber-100 dark:focus:bg-amber-900/30">
                              <X className="w-4 h-4 mr-2" /> Reject Request
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(mov.id)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/30">
                          <Trash2 className="w-4 h-4 mr-2" /> Delete Request
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filteredMovements.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    <Map className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
                    No movement requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
