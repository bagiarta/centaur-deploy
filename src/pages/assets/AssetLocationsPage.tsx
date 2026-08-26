import React, { useState, useEffect } from 'react';
import { PageHeader, SectionCard } from '@/components/ui-enterprise';
import { Search, Plus, MapPin, Building, Server, MoreHorizontal, Edit, Trash2, Box } from 'lucide-react';
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

export default function AssetLocationsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    code: '', name: '', type: 'STORE', parent_location: '', status: 'ACTIVE', latitude: '', longitude: ''
  });

  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [locationAssets, setLocationAssets] = useState<any[]>([]);
  const [viewingLocation, setViewingLocation] = useState<any>(null);

  const fetchLocations = async () => {
    setIsLoading(true);
    try {
      const data = await assetApi.getLocations();
      setLocations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const filteredLocations = locations.filter(loc => 
    loc.location_name.toLowerCase().includes(search.toLowerCase()) || 
    loc.location_code.toLowerCase().includes(search.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ code: '', name: '', type: 'STORE', parent_location: '', status: 'ACTIVE', latitude: '', longitude: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (loc: any) => {
    setEditingId(loc.id);
    setFormData({
      code: loc.location_code,
      name: loc.location_name,
      type: loc.type,
      parent_location: loc.parent_location || '',
      status: loc.status || 'ACTIVE',
      latitude: loc.latitude || '',
      longitude: loc.longitude || ''
    });
    setIsModalOpen(true);
  };

  const handleViewAssets = async (loc: any) => {
    setViewingLocation(loc);
    setIsAssetModalOpen(true);
    setLocationAssets([]);
    try {
      const data = await assetApi.getLocationAssets(loc.location_code, loc.location_name);
      setLocationAssets(data);
    } catch(err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Clean up empty lat/long
      const payload = { ...formData };
      if (payload.latitude === '') delete (payload as any).latitude;
      if (payload.longitude === '') delete (payload as any).longitude;

      if (editingId) {
        await assetApi.updateLocation(editingId, payload);
      } else {
        await assetApi.createLocation(payload);
      }
      setIsModalOpen(false);
      fetchLocations();
    } catch (err) {
      alert("Failed to save location");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this location?")) {
      try {
        await assetApi.deleteLocation(id);
        fetchLocations();
      } catch (err) {
        alert("Failed to delete location");
      }
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader 
        title="Asset Locations" 
        subtitle="Manage physical locations where assets are deployed or stored."
      />

      <SectionCard>
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-6">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search locations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-md text-sm outline-none focus:border-primary transition-all"
            />
          </div>
          
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <button onClick={handleOpenAdd} className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors">
                <Plus className="w-4 h-4" />
                Add Location
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Location' : 'Add New Location'}</DialogTitle>
                <DialogDescription>
                  {editingId ? 'Update physical location details.' : 'Create a new physical location for asset placement.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location Code</label>
                  <input required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. ST-KUTA" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Location Name</label>
                  <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. Store Kuta Bali" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="HO">Head Office (HO)</option>
                    <option value="STORE">Store</option>
                    <option value="WAREHOUSE">Warehouse</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Parent Location (Optional)</label>
                  <input value={formData.parent_location} onChange={e => setFormData({...formData, parent_location: e.target.value})} className="w-full p-2 border rounded-md" placeholder="e.g. REGION-BALI" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Latitude</label>
                    <input type="number" step="any" value={formData.latitude} onChange={e => setFormData({...formData, latitude: e.target.value})} className="w-full p-2 border rounded-md" placeholder="-8.712978" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Longitude</label>
                    <input type="number" step="any" value={formData.longitude} onChange={e => setFormData({...formData, longitude: e.target.value})} className="w-full p-2 border rounded-md" placeholder="115.167767" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-2 border rounded-md bg-background">
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
                <DialogFooter className="pt-4">
                  <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium">
                    {editingId ? 'Update Location' : 'Save Location'}
                  </button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* ASSET LIST MODAL */}
          <Dialog open={isAssetModalOpen} onOpenChange={setIsAssetModalOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Assets at {viewingLocation?.location_name}</DialogTitle>
                <DialogDescription>
                  List of all devices and assets mapped to this location.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 max-h-[50vh] overflow-y-auto space-y-2">
                {locationAssets.length === 0 ? (
                   <p className="text-center text-muted-foreground text-sm py-4">No assets found for this location.</p>
                ) : (
                  locationAssets.map((asset, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-muted/50 border border-border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{asset.name}</p>
                        <p className="text-xs text-muted-foreground">{asset.id} • {asset.category}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">{asset.source}</span>
                        <span className="text-[10px] text-muted-foreground">{asset.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">Loading locations...</div>
          ) : filteredLocations.length > 0 ? (
            filteredLocations.map(loc => (
              <div key={loc.id} className="p-5 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors group flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {loc.type === 'HO' ? <Building className="w-5 h-5" /> : 
                         loc.type === 'STORE' ? <MapPin className="w-5 h-5" /> : 
                         <Server className="w-5 h-5" />}
                      </div>
                      <div>
                        <h3 className="font-semibold">{loc.location_name}</h3>
                        <p className="text-xs text-muted-foreground">{loc.location_code}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors outline-none focus:ring-2 focus:ring-primary">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenEdit(loc)} className="cursor-pointer">
                            <Edit className="w-4 h-4 mr-2" /> Edit Location
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(loc.id)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-100 dark:focus:bg-red-900/30">
                            <Trash2 className="w-4 h-4 mr-2" /> Delete Location
                          </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  
                  {loc.latitude && loc.longitude && (
                     <div className="mb-3 text-[10px] text-muted-foreground flex gap-1">
                       <MapPin className="w-3 h-3" /> {loc.latitude}, {loc.longitude}
                     </div>
                  )}
                </div>

                <div>
                  <div className="mt-2 mb-4 p-2 bg-muted/30 rounded border border-border/50 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleViewAssets(loc)}>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                       <Box className="w-4 h-4" /> Mapped Assets
                    </div>
                    <span className="font-bold text-foreground">{loc.asset_count || 0}</span>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                      loc.status === 'ACTIVE' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                    )}>
                      {loc.status}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                      {loc.type}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-12 text-center border border-dashed rounded-xl border-border">
              <MapPin className="w-8 h-8 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">No locations found matching your criteria.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
