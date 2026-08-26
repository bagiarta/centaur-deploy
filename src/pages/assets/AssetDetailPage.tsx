import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard } from '@/components/ui-enterprise';
import { 
  Package, Server, Tag, MapPin, Wrench, ShieldAlert, FileText, 
  Settings, Image as ImageIcon, ChevronLeft, Calendar, User, Upload, Download, Trash2,
  DollarSign, Calculator, AlertTriangle, Cpu, Plus, MoreHorizontal, Edit
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';
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

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('general');
  const [isComponentModalOpen, setIsComponentModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newComponent, setNewComponent] = useState({ name: '', serial_number: '' });
  const [components, setComponents] = useState<any[]>([]);
  const [asset, setAsset] = useState<any>(null);
  
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  
  const [editFormData, setEditFormData] = useState<any>({});

  const fetchAssetAndComponents = async () => {
    try {
      const [assets, cats, locs, vens] = await Promise.all([
        assetApi.getAssets(),
        assetApi.getCategories(),
        assetApi.getLocations(),
        assetApi.getVendors()
      ]);
      setCategories(cats);
      setLocations(locs);
      setVendors(vens);
      
      const found = assets.find((a: any) => a.id.toString() === id);
      if (found) {
        setAsset(found);
        setEditFormData({
          ...found,
          purchase_date: found.purchase_date ? new Date(found.purchase_date).toISOString().split('T')[0] : ''
        });
        const comps = await assetApi.getComponents(found.asset_code);
        setComponents(comps);
      }
    } catch(err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchAssetAndComponents();
  }, [id]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    try {
      await assetApi.updateAsset(asset.id, {
        ...editFormData,
        vendor_id: editFormData.vendor_id ? parseInt(editFormData.vendor_id) : null
      });
      setIsEditModalOpen(false);
      fetchAssetAndComponents();
    } catch(err) {
      alert("Failed to update asset.");
    }
  };

  const handleAddComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;
    try {
      await assetApi.createComponent(asset.asset_code, newComponent);
      setIsComponentModalOpen(false);
      setNewComponent({ name: '', serial_number: '' });
      fetchAssetAndComponents();
    } catch(err) {
      alert("Failed to add component.");
    }
  };

  const handleDeleteComponent = async (compId: number) => {
    if (confirm("Delete this component?")) {
      try {
        await assetApi.deleteComponent(compId);
        fetchAssetAndComponents();
      } catch(err) {
        alert("Failed to delete component.");
      }
    }
  }

  if (!asset) {
    return <div className="p-8 text-center text-muted-foreground">Loading asset details...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <button 
            onClick={() => navigate('/assets')}
            className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ChevronLeft className="w-3 h-3 mr-1" /> Back to Register
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{asset.asset_name}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{asset.asset_code}</span>
                <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> {asset.category_code}</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogTrigger asChild>
              <button className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:bg-secondary/80 transition-colors flex items-center gap-2">
                <Edit className="w-4 h-4" /> Edit Asset
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Edit Asset</DialogTitle>
                <DialogDescription>
                  Update the details of this asset.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleEditSubmit} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Asset Name</label>
                  <input required value={editFormData.asset_name || ''} onChange={e => setEditFormData({...editFormData, asset_name: e.target.value})} className="w-full p-2 border rounded-md" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Category</label>
                  <select required value={editFormData.category_code || ''} onChange={e => setEditFormData({...editFormData, category_code: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="">-- Choose Category --</option>
                    {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Location</label>
                    <LocationSelect
                      value={editFormData.location_code || ''}
                      onChange={(val) => setEditFormData({...editFormData, location_code: val})}
                      locations={locations}
                      required
                    />
                  </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Vendor</label>
                  <select value={editFormData.vendor_id || ''} onChange={e => setEditFormData({...editFormData, vendor_id: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="">-- None --</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <select required value={editFormData.status || 'ACTIVE'} onChange={e => setEditFormData({...editFormData, status: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="IN_USE">IN_USE</option>
                      <option value="IN_STORAGE">IN_STORAGE</option>
                      <option value="UNDER_REPAIR">UNDER_REPAIR</option>
                      <option value="RETIRED">RETIRED</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Condition</label>
                    <select required value={editFormData.condition || 'NEW'} onChange={e => setEditFormData({...editFormData, condition: e.target.value})} className="w-full p-2 border rounded-md bg-background">
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
                    <input type="date" value={editFormData.purchase_date || ''} onChange={e => setEditFormData({...editFormData, purchase_date: e.target.value})} className="w-full p-2 border rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Price</label>
                    <input type="number" step="0.01" value={editFormData.price || ''} onChange={e => setEditFormData({...editFormData, price: parseFloat(e.target.value) || 0})} className="w-full p-2 border rounded-md" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">PO Number</label>
                    <input value={editFormData.po_number || ''} onChange={e => setEditFormData({...editFormData, po_number: e.target.value})} className="w-full p-2 border rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Serial Number</label>
                    <input value={editFormData.serial_number || ''} onChange={e => setEditFormData({...editFormData, serial_number: e.target.value})} className="w-full p-2 border rounded-md" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Kode Aktiva</label>
                    <input value={editFormData.activa_code || ''} onChange={e => setEditFormData({...editFormData, activa_code: e.target.value})} className="w-full p-2 border rounded-md" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Physical Address</label>
                    <input value={editFormData.physical_address || ''} onChange={e => setEditFormData({...editFormData, physical_address: e.target.value})} className="w-full p-2 border rounded-md" />
                  </div>
                </div>
                
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Save Changes</button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2">
            <Tag className="w-4 h-4" /> Print Label
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* LEFT COLUMN - QUICK STATS */}
        <div className="md:col-span-1 space-y-4">
          <SectionCard className="p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Status Overview</h3>
            <div className="space-y-4">
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Operational Status</span>
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-flex",
                  asset.status === 'ACTIVE' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : 
                  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                )}>
                  {asset.status}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block mb-1">Physical Condition</span>
                <span className="text-sm font-medium">{asset.condition}</span>
              </div>
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Current Location</span>
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="w-4 h-4 text-primary" /> 
                    {locations.find(l => l.location_code === asset.location_code)?.location_name || asset.location_code}
                  </div>
                </div>
            </div>
          </SectionCard>
        </div>

        {/* RIGHT COLUMN - TABS */}
        <div className="md:col-span-3">
          <TabsPrimitive.Root value={activeTab} onValueChange={setActiveTab}>
            <TabsPrimitive.List className="flex overflow-x-auto border-b border-border hide-scrollbar mb-4">
              {[
                { id: 'general', label: 'General Info', icon: FileText },
                { id: 'components', label: 'Components / Parts', icon: Cpu },
              ].map(tab => (
                <TabsPrimitive.Trigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap outline-none",
                    activeTab === tab.id 
                      ? "border-primary text-foreground" 
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </TabsPrimitive.Trigger>
              ))}
            </TabsPrimitive.List>

            <div className="mt-4 focus:outline-none">
              <TabsPrimitive.Content value="general" className="outline-none">
                <SectionCard>
                  <h3 className="font-semibold text-lg mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-8">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Asset Code</p>
                      <p className="font-medium font-mono">{asset.asset_code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Asset Name</p>
                      <p className="font-medium">{asset.asset_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Category</p>
                      <p className="font-medium">{asset.category_code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Purchase Date</p>
                      <p className="font-medium">{asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Vendor ID</p>
                      <p className="font-medium">{asset.vendor_id || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Price</p>
                      <p className="font-medium">{asset.price ? `$${asset.price}` : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">PO Number</p>
                      <p className="font-medium">{asset.po_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Serial Number</p>
                      <p className="font-medium font-mono">{asset.serial_number || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Kode Aktiva</p>
                      <p className="font-medium font-mono">{asset.activa_code || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Physical Address</p>
                      <p className="font-medium">{asset.physical_address || '-'}</p>
                    </div>
                  </div>
                </SectionCard>
              </TabsPrimitive.Content>

              <TabsPrimitive.Content value="components" className="outline-none">
                <SectionCard>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-primary" /> Asset Components
                    </h3>
                    
                    <Dialog open={isComponentModalOpen} onOpenChange={setIsComponentModalOpen}>
                      <DialogTrigger asChild>
                        <button className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-xs font-medium">
                          <Plus className="w-3.5 h-3.5" /> Add Component
                        </button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Add Component Part</DialogTitle>
                          <DialogDescription>
                            Add sub-components (like Monitor, Keyboard) to this asset.
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleAddComponent} className="space-y-4 py-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Component Name</label>
                            <input required value={newComponent.name} onChange={e => setNewComponent({...newComponent, name: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. 24-inch Dell Monitor" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Serial Number</label>
                            <input value={newComponent.serial_number} onChange={e => setNewComponent({...newComponent, serial_number: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. S/N 123456" />
                          </div>
                          <DialogFooter className="pt-4">
                            <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">Add Part</button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                  
                  <div className="space-y-3">
                    {components.length === 0 ? (
                      <div className="text-center py-8 border border-dashed rounded-lg border-border">
                        <Cpu className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                        <p className="text-sm font-medium">No components registered</p>
                        <p className="text-xs text-muted-foreground mt-1">Break down this asset into smaller parts (e.g., Monitor, Keyboard, Mouse)</p>
                      </div>
                    ) : (
                      components.map(comp => (
                        <div key={comp.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
                          <div>
                            <p className="text-sm font-medium">{comp.name}</p>
                            <p className="text-xs text-muted-foreground">SN: {comp.serial_number}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">
                              {comp.status}
                            </span>
                            <button onClick={() => handleDeleteComponent(comp.id)} className="p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>
              </TabsPrimitive.Content>

            </div>
          </TabsPrimitive.Root>
        </div>
      </div>
    </div>
  );
}
