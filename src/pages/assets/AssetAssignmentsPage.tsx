import React, { useState, useEffect } from 'react';
import { PageHeader, SectionCard } from '@/components/ui-enterprise';
import { Search, Plus, UserCheck, Calendar, FileText, CheckCircle2, XCircle, Clock, MoreHorizontal, Edit, Trash2, Printer } from 'lucide-react';
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
import { LocationSelect } from '@/components/LocationSelect';

export default function AssetAssignmentsPage() {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [formData, setFormData] = useState({ asset_codes: [] as string[], assigned_to: '', department_code: '', location_code: '', notes: '' });

  // Return Modal State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [returnFormData, setReturnFormData] = useState({ return_condition: 'USED', return_notes: '' });

  // Grouping State
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    try {
      const [assigData, assetData, deptData, locData] = await Promise.all([
        assetApi.getAssignments(),
        assetApi.getAssets(),
        assetApi.getDepartments(),
        assetApi.getLocations()
      ]);
      setAssignments(assigData);
      setAssets(assetData);
      setDepartments(deptData);
      setLocations(locData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAssignments = assignments.filter(a => {
    const s = search.toLowerCase();
    return a.assigned_to?.toLowerCase().includes(s) || 
           a.asset_code?.toLowerCase().includes(s) ||
           a.bast_number?.toLowerCase().includes(s) ||
           a.asset_name?.toLowerCase().includes(s) ||
           a.serial_number?.toLowerCase().includes(s) ||
           a.activa_code?.toLowerCase().includes(s) ||
           a.physical_address?.toLowerCase().includes(s);
  });

  const groupedAssignments = filteredAssignments.reduce((acc: any, curr: any) => {
    const key = curr.bast_number || `no-bast-${curr.id || curr.assignment_id}`;
    if (!acc[key]) {
      acc[key] = {
        key: key,
        bast_number: curr.bast_number,
        assigned_to: curr.assigned_to,
        department_name: curr.department_name || curr.department_code,
        assigned_date: curr.assigned_date,
        items: []
      };
    }
    acc[key].items.push(curr);
    return acc;
  }, {});

  const groupedArray = Object.values(groupedAssignments) as any[];

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.asset_codes.length === 0) {
      alert("Please select at least one asset");
      return;
    }
    try {
      await assetApi.createAssignment(formData);
      setIsModalOpen(false);
      setFormData({ asset_codes: [], assigned_to: '', department_code: '', location_code: '', notes: '' });
      fetchData();
    } catch (err) {
      alert("Failed to save assignment.");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this assignment?")) {
      try {
        await assetApi.deleteAssignment(id);
        fetchData();
      } catch (err) {
        alert("Failed to delete assignment.");
      }
    }
  };

  const openReturnModal = (assig: any) => {
    setSelectedAssignment(assig);
    setReturnFormData({ return_condition: 'USED', return_notes: '' });
    setReturnModalOpen(true);
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    try {
      await assetApi.returnAsset(selectedAssignment.id, returnFormData.return_condition, returnFormData.return_notes);
      setReturnModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to return asset.");
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader 
        title="Asset Assignments" 
        subtitle="Track which assets are assigned to which employees or departments."
      />

      <SectionCard>
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search employee or asset..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-primary transition-all"
            />
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <button className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                Assign Asset
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Assign Asset</DialogTitle>
                <DialogDescription>
                  Hand over an asset to an employee or department.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Assets (Bisa pilih lebih dari 1)</label>
                  <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2 bg-background">
                    {assets
                      .filter(a => a.status !== 'IN_USE' && a.condition !== 'DAMAGED')
                      .map(a => (
                        <label key={a.asset_code} className="flex items-center space-x-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.asset_codes.includes(a.asset_code)}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setFormData(prev => ({
                                ...prev,
                                asset_codes: checked 
                                  ? [...prev.asset_codes, a.asset_code]
                                  : prev.asset_codes.filter(c => c !== a.asset_code)
                              }));
                            }}
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">{a.asset_name} ({a.asset_code})</span>
                        </label>
                      ))}
                    {assets.filter(a => a.status !== 'IN_USE' && a.condition !== 'DAMAGED').length === 0 && (
                      <p className="text-sm text-gray-500 italic">No available assets.</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assign To (Employee Name)</label>
                  <input required value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Department</label>
                  <select value={formData.department_code} onChange={e => setFormData({...formData, department_code: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="">-- Optional --</option>
                    {departments.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Assignment Location</label>
                  <LocationSelect
                    value={formData.location_code}
                    onChange={(val) => setFormData({...formData, location_code: val})}
                    locations={locations}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes</label>
                  <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full p-2 border rounded-md min-h-[80px]" placeholder="Condition notes..." />
                </div>
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Save Assignment</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Return Modal */}
          <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Return Asset</DialogTitle>
                <DialogDescription>
                  Mark this asset as returned from {selectedAssignment?.assigned_to}. It will be moved to IN_STORAGE.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleReturnSubmit} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Condition on Return</label>
                  <select required value={returnFormData.return_condition} onChange={e => setReturnFormData({...returnFormData, return_condition: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="NEW">New (Baru)</option>
                    <option value="USED">Used (Bekas / Normal)</option>
                    <option value="DAMAGED">Damaged (Rusak)</option>
                    <option value="BROKEN">Broken (Hancur / Mati Total)</option>
                    <option value="LOST">Lost (Hilang)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Return Notes</label>
                  <textarea value={returnFormData.return_notes} onChange={e => setReturnFormData({...returnFormData, return_notes: e.target.value})} className="w-full p-2 border rounded-md min-h-[80px]" placeholder="Explain condition or reason for return..." />
                </div>
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Confirm Return</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">BAST Number</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned To</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Department</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned Date</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {groupedArray.map(group => {
                const isExpanded = expandedGroups[group.key];
                return (
                  <React.Fragment key={group.key}>
                    <tr className="hover:bg-muted/30 transition-colors group cursor-pointer" onClick={() => toggleGroup(group.key)}>
                      <td className="p-3">
                        <div className="font-bold text-sm text-primary">{group.bast_number || 'No BAST'}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{group.assigned_to}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{group.department_name || '-'}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4" />
                          {group.assigned_date ? new Date(group.assigned_date).toLocaleDateString() : '-'}
                        </div>
                      </td>
                      <td className="p-3 text-sm">
                        <span className="bg-muted px-2 py-1 rounded-full text-xs font-medium">
                          {group.items.length} Asset{group.items.length > 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-2 hover:bg-gray-200 rounded-md dark:hover:bg-gray-800" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {group.bast_number && (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); window.open(`/assets/assignments/bast/${group.bast_number}`, '_blank'); }} className="cursor-pointer">
                                <Printer className="w-4 h-4 mr-2" /> Print BAST
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="p-0 bg-muted/10 border-b border-border">
                          <div className="p-4 pl-12 space-y-2">
                            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Asset Details</h4>
                            <table className="w-full text-left">
                              <thead>
                                <tr className="border-b border-border text-xs text-muted-foreground">
                                  <th className="pb-2 font-medium">Asset Name</th>
                                  <th className="pb-2 font-medium">Code</th>
                                  <th className="pb-2 font-medium">Identifiers</th>
                                  <th className="pb-2 font-medium">Location</th>
                                  <th className="pb-2 font-medium">Status</th>
                                  <th className="pb-2 font-medium text-right">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((assig: any) => (
                                  <tr key={assig.id || assig.assignment_id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                                    <td className="py-3 text-sm font-medium">{assig.asset_name}</td>
                                    <td className="py-3 text-sm text-muted-foreground">{assig.asset_code}</td>
                                    <td className="py-3 text-sm text-muted-foreground">
                                      {assig.serial_number && <div className="text-xs">SN: {assig.serial_number}</div>}
                                      {assig.activa_code && <div className="text-xs">Aktiva: {assig.activa_code}</div>}
                                      {!assig.serial_number && !assig.activa_code && '-'}
                                    </td>
                                    <td className="py-3 text-sm text-muted-foreground">
                                      {assig.physical_address || '-'}
                                    </td>
                                    <td className="py-3">
                                      <div className="flex flex-col gap-1">
                                        <span className={cn(
                                          "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 w-max",
                                          assig.status === 'ACTIVE' || assig.assignment_status === 'ACTIVE' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"
                                        )}>
                                          {assig.status === 'ACTIVE' || assig.assignment_status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                          {assig.assignment_status || assig.status}
                                        </span>
                                        {(assig.assignment_status === 'RETURNED' || assig.status === 'RETURNED') && assig.return_bast_number && (
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); window.open(`/assets/assignments/bast/${assig.return_bast_number}`, '_blank'); }}
                                            className="text-[10px] text-muted-foreground hover:text-primary font-medium flex items-center gap-1 cursor-pointer transition-colors"
                                            title="Print Return BAST"
                                          >
                                            <FileText className="w-3 h-3" /> {assig.return_bast_number} <Printer className="w-3 h-3 ml-1" />
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 text-right">
                                      {(assig.status === 'ACTIVE' || assig.assignment_status === 'ACTIVE') && (
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); openReturnModal(assig); }}
                                          className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 flex items-center gap-1 ml-auto"
                                        >
                                          <Clock className="w-3 h-3" /> Return Item
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground/50" />
                    No assignments found.
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
