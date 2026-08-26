import React, { useState, useEffect, useRef } from 'react';
import { PageHeader, SectionCard } from '@/components/ui-enterprise';
import { Search, Plus, Filter, LayoutTemplate, Tag, QrCode, MoreHorizontal, Eye, Edit, Trash2, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
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

export default function AssetRegisterPage() {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({ 
    asset_name: '', 
    category_code: '', 
    location_code: '', 
    vendor_id: '',
    status: 'ACTIVE',
    condition: 'NEW',
    price: 0,
    purchase_date: '',
    po_number: '',
    serial_number: '',
    activa_code: '',
    physical_address: ''
  });
  
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const [ass, cats, locs, vens] = await Promise.all([
        assetApi.getAssets(),
        assetApi.getCategories(),
        assetApi.getLocations(),
        assetApi.getVendors()
      ]);
      setAssets(ass);
      setCategories(cats);
      setLocations(locs);
      setVendors(vens);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredAssets = assets.filter(a => {
    const matchSearch = a.asset_name.toLowerCase().includes(search.toLowerCase()) || 
                        a.asset_code.toLowerCase().includes(search.toLowerCase());
    const matchCategory = filterCategory === 'ALL' || a.category_code === filterCategory;
    return matchSearch && matchCategory;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assetApi.createAsset({
        ...formData,
        vendor_id: formData.vendor_id ? parseInt(formData.vendor_id) : null
      });
      setIsModalOpen(false);
      setFormData({ 
        asset_name: '', category_code: '', location_code: '', vendor_id: '', 
        status: 'ACTIVE', condition: 'NEW', price: 0,
        purchase_date: '', po_number: '', serial_number: '', activa_code: '', physical_address: '' 
      });
      fetchData();
    } catch (err) {
      alert("Failed to create asset.");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this asset?")) {
      try {
        await assetApi.deleteAsset(id);
        fetchData();
      } catch (err) {
        alert("Failed to delete asset.");
      }
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader 
        title="Asset Register" 
        subtitle="Master list of all company assets across all locations and categories."
      />

      <SectionCard>
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search assets by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-primary transition-all"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="bg-background border border-border rounded-md text-sm outline-none focus:border-primary px-3 py-2 w-32"
            >
              <option value="ALL">All Categories</option>
              {categories.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <button className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                Add Asset
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Register New Asset</DialogTitle>
                <DialogDescription>
                  Enter the basic details to register a new asset into the system.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asset Name</label>
                  <input required value={formData.asset_name} onChange={e => setFormData({...formData, asset_name: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. Dell Latitude 7420" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <select required value={formData.category_code} onChange={e => setFormData({...formData, category_code: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="">-- Choose Category --</option>
                    {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2 flex flex-col">
                  <label className="text-sm font-medium">Location</label>
                  <LocationSelect
                    value={formData.location_code}
                    onChange={(val) => setFormData({...formData, location_code: val})}
                    locations={locations}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vendor</label>
                  <select value={formData.vendor_id} onChange={e => setFormData({...formData, vendor_id: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="">-- None --</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <select required value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="IN_USE">IN_USE</option>
                        <option value="IN_STORAGE">IN_STORAGE</option>
                        <option value="UNDER_REPAIR">UNDER_REPAIR</option>
                        <option value="RETIRED">RETIRED</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Condition</label>
                      <select required value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                        <option value="NEW">NEW</option>
                        <option value="GOOD">GOOD</option>
                        <option value="USED">USED</option>
                        <option value="FAIR">FAIR</option>
                        <option value="DAMAGED">DAMAGED</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Purchase Date</label>
                      <input type="date" value={formData.purchase_date} onChange={e => setFormData({...formData, purchase_date: e.target.value})} className="w-full p-2 border rounded-md" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Price</label>
                      <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded-md" placeholder="0.00" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">PO Number</label>
                      <input value={formData.po_number} onChange={e => setFormData({...formData, po_number: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. PO-2026-001" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Serial Number</label>
                      <input value={formData.serial_number} onChange={e => setFormData({...formData, serial_number: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. SN12345678" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Kode Aktiva</label>
                      <input value={formData.activa_code} onChange={e => setFormData({...formData, activa_code: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. AKT-001" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Physical Address</label>
                      <input value={formData.physical_address} onChange={e => setFormData({...formData, physical_address: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. Rack 3, Room A" />
                    </div>
                  </div>
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Save Asset</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Asset Details</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Condition</th>
                <th className="p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.length > 0 ? (
                filteredAssets.map(asset => (
                  <tr key={asset.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <LayoutTemplate className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{asset.asset_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1"><QrCode className="w-3 h-3" /> {asset.asset_code}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                        <Tag className="w-3 h-3" /> {asset.category_code}
                      </span>
                    </td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {locations.find(l => l.location_code === asset.location_code)?.location_name || asset.location_code}
                      </td>
                    <td className="p-3">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        asset.status === 'ACTIVE' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        asset.status === 'IN_STORAGE' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        asset.status === 'UNDER_REPAIR' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                        "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      )}>
                        {asset.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-sm font-medium">{asset.condition}</td>
                    <td className="p-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors outline-none focus:ring-2 focus:ring-primary">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => navigate(`/assets/${asset.id}`)} className="cursor-pointer">
                            <Eye className="w-4 h-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => alert("Edit not implemented")} className="cursor-pointer">
                            <Edit className="w-4 h-4 mr-2" /> Edit Asset
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(asset.id)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/30">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Asset
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground border-b border-border border-dashed">
                    No assets found.
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
