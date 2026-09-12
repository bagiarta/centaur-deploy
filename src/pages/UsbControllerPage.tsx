import React, { useState, useEffect } from 'react';
import { Shield, List, AlertTriangle, CheckCircle, Plus, Trash2, HardDrive, Filter, RefreshCw, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface UsbPolicy {
  id: string;
  target_type: string;
  target_id: string;
  ip?: string;
  action: string;
  created_by: string;
  updated_at: string;
}

interface UsbEvent {
  id: number;
  event_id: string;
  device_id: string;
  hostname: string;
  vendor_id: string;
  product_id: string;
  serial_number: string;
  manufacturer: string;
  product_name: string;
  action_taken: string;
  timestamp: string;
}

export default function UsbControllerPage() {
  const [policies, setPolicies] = useState<UsbPolicy[]>([]);
  const [events, setEvents] = useState<UsbEvent[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTargetType, setNewTargetType] = useState('device');
  const [newTargetId, setNewTargetId] = useState('');
  const [newAction, setNewAction] = useState('block');

  const fetchPolicies = async () => {
    try {
      const res = await fetch('/api/usb/policies');
      if (!res.ok) throw new Error('Failed to fetch policies');
      const data = await res.json();
      setPolicies(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/usb/events');
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      setEvents(data);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      fetchPolicies(), 
      fetchEvents(),
      fetch('/api/devices').then(res => res.json()).then(data => setDevices(Array.isArray(data) ? data : [])).catch(() => {}),
      fetch('/api/groups').then(res => res.json()).then(data => setGroups(Array.isArray(data) ? data : [])).catch(() => {})
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddPolicy = async () => {
    if (!newTargetId && newTargetType !== 'global') {
      toast.error('Target ID is required');
      return;
    }
    
    try {
      const payload = {
        target_type: newTargetType,
        target_id: newTargetType === 'global' ? 'all' : newTargetId,
        action: newAction,
        created_by: 'admin' // In a real app, get from context
      };

      const res = await fetch('/api/usb/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add policy');
      }
      
      toast.success('Policy applied successfully');
      setIsAddModalOpen(false);
      setNewTargetId('');
      fetchPolicies();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeletePolicy = async (id: string) => {
    try {
      const res = await fetch(`/api/usb/policies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Policy deleted');
        fetchPolicies();
      }
    } catch (err) {
      toast.error('Failed to delete policy');
    }
  };

  const handleUpdateAction = async (policy: UsbPolicy, newAction: string) => {
    try {
      const payload = {
        target_type: policy.target_type,
        target_id: policy.target_id,
        action: newAction,
        created_by: policy.created_by
      };
      const res = await fetch('/api/usb/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success('Policy action updated successfully');
        fetchPolicies();
      } else {
        toast.error('Failed to update policy');
      }
    } catch (err) {
      toast.error('Error updating policy');
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <HardDrive className="h-8 w-8 text-primary" />
            Centralized USB Controller
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage mass storage access policies and monitor USB device usage across your fleet.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Policy
          </Button>
        </div>
      </div>

      <Tabs defaultValue="policies" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="policies">Access Policies</TabsTrigger>
          <TabsTrigger value="events">Activity Log & Alerts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="policies" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>USB Access Policies</CardTitle>
              <CardDescription>Rules defining which devices are allowed or blocked from using USB mass storage.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-muted-foreground">Loading policies...</div>
              ) : policies.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center">
                  <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">No Policies Configured</h3>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">Add a policy to control USB access on your devices.</p>
                  <Button variant="outline" onClick={() => setIsAddModalOpen(true)}>Create Policy</Button>
                </div>
              ) : (
                <div className="relative overflow-x-auto rounded-md border">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-muted">
                      <tr>
                        <th className="px-6 py-3">Target Level</th>
                        <th className="px-6 py-3">Target ID</th>
                        <th className="px-6 py-3">Action</th>
                        <th className="px-6 py-3">Created By</th>
                        <th className="px-6 py-3">Last Updated</th>
                        <th className="px-6 py-3 text-right">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.map((p) => (
                        <tr key={p.id} className="border-b bg-card">
                          <td className="px-6 py-4 font-medium capitalize">
                            {p.target_type === 'global' ? (
                              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Global</Badge>
                            ) : p.target_type === 'group' ? (
                              <Badge variant="outline">Group</Badge>
                            ) : (
                              <Badge variant="outline">Device</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">
                            <div>{p.target_id}</div>
                            {p.ip && <div className="text-[10px] text-muted-foreground mt-1">{p.ip}</div>}
                          </td>
                          <td className="px-6 py-4">
                            <Select 
                              value={p.action} 
                              onValueChange={(val) => handleUpdateAction(p, val)}
                            >
                              <SelectTrigger className="h-8 w-[130px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">
                                  <div className="flex items-center text-green-600"><CheckCircle className="mr-2 h-4 w-4" /> Allow</div>
                                </SelectItem>
                                <SelectItem value="readonly">
                                  <div className="flex items-center text-yellow-600"><AlertTriangle className="mr-2 h-4 w-4" /> Read Only</div>
                                </SelectItem>
                                <SelectItem value="block">
                                  <div className="flex items-center text-red-600"><X className="mr-2 h-4 w-4" /> Block</div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-6 py-4">{p.created_by}</td>
                          <td className="px-6 py-4">{format(new Date(p.updated_at), 'MMM d, yyyy HH:mm')}</td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDeletePolicy(p.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>USB Activity Logs</CardTitle>
              <CardDescription>Real-time notifications from agents when USB devices are inserted.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-muted-foreground">Loading events...</div>
              ) : events.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No USB activity recorded yet.</div>
              ) : (
                <div className="relative overflow-x-auto rounded-md border">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-muted">
                      <tr>
                        <th className="px-6 py-3">Timestamp</th>
                        <th className="px-6 py-3">Device / Hostname</th>
                        <th className="px-6 py-3">Hardware Info</th>
                        <th className="px-6 py-3">Product Name</th>
                        <th className="px-6 py-3">Action Taken</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-b bg-card">
                          <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                            {format(new Date(e.timestamp), 'MMM d, yyyy HH:mm:ss')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium">{e.hostname}</div>
                            <div className="text-xs text-muted-foreground">{e.device_id}</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                            VID_{e.vendor_id}&PID_{e.product_id}<br/>
                            SN: {e.serial_number || 'N/A'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium">{e.product_name || 'Unknown USB Device'}</div>
                            <div className="text-xs text-muted-foreground">{e.manufacturer || 'Unknown Vendor'}</div>
                          </td>
                          <td className="px-6 py-4">
                             {e.action_taken === 'BLOCKED' ? (
                                <Badge variant="destructive">BLOCKED</Badge>
                             ) : e.action_taken === 'ALLOWED' ? (
                                <Badge className="bg-green-500 hover:bg-green-600">ALLOWED</Badge>
                             ) : (
                                <Badge variant="secondary">{e.action_taken}</Badge>
                             )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create USB Policy</DialogTitle>
            <DialogDescription>Define a new access rule for USB mass storage devices.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Level</Label>
              <Select value={newTargetType} onValueChange={(val) => { setNewTargetType(val); setNewTargetId(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global (All Devices)</SelectItem>
                  <SelectItem value="group">Device Group</SelectItem>
                  <SelectItem value="device">Specific Device</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {newTargetType !== 'global' && (
              <div className="space-y-2">
                <Label>{newTargetType === 'group' ? 'Select Group' : 'Select Device'}</Label>
                <SearchableSelect 
                  value={newTargetId} 
                  onValueChange={setNewTargetId}
                  placeholder={newTargetType === 'group' ? 'Search and select a group...' : 'Search and select a device...'}
                  emptyMessage={newTargetType === 'group' ? 'No groups found.' : 'No devices found.'}
                  options={newTargetType === 'group' 
                    ? (Array.isArray(groups) ? groups : []).map(g => ({ label: `${g.name || 'Unnamed'} (${g.id})`, value: String(g.id || '') }))
                    : (Array.isArray(devices) ? devices : []).map(d => ({ label: `${d.hostname || 'Unknown'} ${d.ip ? `(${d.ip})` : ''}`, value: String(d.hostname || '') }))
                  }
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Action</Label>
              <Select value={newAction} onValueChange={setNewAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow All USBs</SelectItem>
                  <SelectItem value="block">Block Mass Storage</SelectItem>
                  <SelectItem value="readonly">Read-Only Mode</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAddPolicy}>Save Policy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
