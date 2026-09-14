import React, { useState, useEffect } from 'react';
import { Shield, List, AlertTriangle, CheckCircle, Plus, Trash2, HardDrive, Filter, RefreshCw, X, Search, ChevronLeft, ChevronRight, Activity, Users, ShieldAlert, CheckSquare } from 'lucide-react';
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
  ip?: string;
}

interface SummaryData {
  total_devices: number;
  total_policies: number;
  policy_allowed: number;
  policy_blocked: number;
  policy_readonly: number;
  allowed_events: number;
  blocked_events: number;
  readonly_events: number;
}

export default function UsbControllerPage() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const [policies, setPolicies] = useState<UsbPolicy[]>([]);
  const [events, setEvents] = useState<UsbEvent[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination & Filter State (Policies)
  const [policyPage, setPolicyPage] = useState(1);
  const [policyTotal, setPolicyTotal] = useState(0);
  const [policySearch, setPolicySearch] = useState('');
  const [policyActionFilter, setPolicyActionFilter] = useState('all');

  // Pagination & Filter State (Events)
  const [eventPage, setEventPage] = useState(1);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventSearch, setEventSearch] = useState('');
  const [eventActionFilter, setEventActionFilter] = useState('all');

  const limit = 15;

  // Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTargetType, setNewTargetType] = useState('device');
  const [newTargetId, setNewTargetId] = useState('');
  const [newAction, setNewAction] = useState('block');

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/usb/summary');
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPolicies = async () => {
    try {
      const actionQ = policyActionFilter !== 'all' ? `&action=${policyActionFilter}` : '';
      const searchQ = policySearch ? `&search=${encodeURIComponent(policySearch)}` : '';
      const res = await fetch(`/api/usb/policies?page=${policyPage}&limit=${limit}${actionQ}${searchQ}`);
      if (!res.ok) throw new Error('Failed to fetch policies');
      const data = await res.json();
      setPolicies(data.data || []);
      setPolicyTotal(data.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const fetchEvents = async () => {
    try {
      const actionQ = eventActionFilter !== 'all' ? `&action=${eventActionFilter === 'readonly' ? 'READ-ONLY' : eventActionFilter.toUpperCase()}` : '';
      const searchQ = eventSearch ? `&search=${encodeURIComponent(eventSearch)}` : '';
      const res = await fetch(`/api/usb/events?page=${eventPage}&limit=${limit}${actionQ}${searchQ}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      setEvents(data.data || []);
      setEventTotal(data.total || 0);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      fetchSummary(),
      fetchPolicies(),
      fetchEvents(),
      fetch('/api/devices').then(res => res.json()).then(data => setDevices(Array.isArray(data) ? data : [])).catch(() => { }),
      fetch('/api/groups').then(res => res.json()).then(data => setGroups(Array.isArray(data) ? data : [])).catch(() => { })
    ]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [policyPage, policySearch, policyActionFilter]);

  useEffect(() => {
    fetchEvents();
  }, [eventPage, eventSearch, eventActionFilter]);

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
      fetchSummary();
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
        fetchSummary();
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
        fetchSummary();
      } else {
        toast.error('Failed to update policy');
      }
    } catch (err) {
      toast.error('Error updating policy');
    }
  };

  const renderPagination = (page: number, total: number, setPage: (p: number) => void) => {
    const totalPages = Math.ceil(total / limit) || 1;
    return (
      <div className="flex items-center justify-between px-4 py-4 border-t bg-card/50">
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium">{Math.min((page - 1) * limit + 1, total)}</span> to <span className="font-medium">{Math.min(page * limit, total)}</span> of <span className="font-medium">{total}</span> entries
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(page - 1, 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium mx-2">
            Page {page} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(page + 1, totalPages))}
            disabled={page === totalPages || totalPages === 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const jumpToTabWithFilter = (tab: string, filterType: 'action', filterValue: string) => {
    setActiveTab(tab);
    if (tab === 'policies') {
      setPolicyActionFilter(filterValue);
      setPolicyPage(1);
    } else if (tab === 'events') {
      setEventActionFilter(filterValue);
      setEventPage(1);
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-[600px] mb-6">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="policies">Access Policies</TabsTrigger>
          <TabsTrigger value="events">Activity Log & Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">

            {/* OVERVIEW CARDS */}
            <Card
              className="cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg border-l-4 border-l-blue-500 bg-gradient-to-br from-card to-blue-500/5"
              onClick={() => jumpToTabWithFilter('policies', 'action', 'all')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Active Policies</CardTitle>
                <Shield className="h-5 w-5 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summary?.total_policies || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Rules actively managed</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg border-l-4 border-l-green-500 bg-gradient-to-br from-card to-green-500/5"
              onClick={() => jumpToTabWithFilter('policies', 'action', 'allow')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Allowed Devices</CardTitle>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">{summary?.policy_allowed || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Policies granting USB access</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg border-l-4 border-l-destructive bg-gradient-to-br from-card to-destructive/5"
              onClick={() => jumpToTabWithFilter('policies', 'action', 'block')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Blocked Devices</CardTitle>
                <ShieldAlert className="h-5 w-5 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">{summary?.policy_blocked || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Policies denying USB access</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg border-l-4 border-l-amber-500 bg-gradient-to-br from-card to-amber-500/5"
              onClick={() => jumpToTabWithFilter('policies', 'action', 'readonly')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Read-Only Devices</CardTitle>
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{summary?.policy_readonly || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">Policies restricted to read mode</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-indigo-500" />
                  Recent Actions (30 Days)
                </CardTitle>
                <CardDescription>Breakdown of USB events intercepted by the agents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center p-3 rounded-lg border bg-gradient-to-r from-card to-green-500/10 cursor-pointer hover:border-green-500/50 transition-colors"
                    onClick={() => jumpToTabWithFilter('events', 'action', 'allow')}
                  >
                    <CheckSquare className="h-8 w-8 text-green-500 mr-4" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg text-green-600 dark:text-green-400">{summary?.allowed_events || 0}</h4>
                      <p className="text-sm text-muted-foreground">Authorized Insertions</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground opacity-50" />
                  </div>

                  <div className="flex items-center p-3 rounded-lg border bg-gradient-to-r from-card to-destructive/10 cursor-pointer hover:border-destructive/50 transition-colors"
                    onClick={() => jumpToTabWithFilter('events', 'action', 'block')}
                  >
                    <X className="h-8 w-8 text-destructive mr-4" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg text-destructive">{summary?.blocked_events || 0}</h4>
                      <p className="text-sm text-muted-foreground">Blocked Attempts</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground opacity-50" />
                  </div>

                  <div className="flex items-center p-3 rounded-lg border bg-gradient-to-r from-card to-amber-500/10 cursor-pointer hover:border-amber-500/50 transition-colors"
                    onClick={() => jumpToTabWithFilter('events', 'action', 'readonly')}
                  >
                    <AlertTriangle className="h-8 w-8 text-amber-500 mr-4" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg text-amber-600 dark:text-amber-400">{summary?.readonly_events || 0}</h4>
                      <p className="text-sm text-muted-foreground">Read-Only</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground opacity-50" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Fleet Coverage
                </CardTitle>
                <CardDescription>Number of unique computers successfully enforcing USB policies.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full"></div>
                  <div className="relative h-32 w-32 rounded-full border-4 border-primary flex items-center justify-center bg-card shadow-lg">
                    <div className="text-center">
                      <div className="text-4xl font-extrabold text-foreground">{summary?.total_devices || 0}</div>
                      <div className="text-xs font-medium text-muted-foreground mt-1">Endpoints</div>
                    </div>
                  </div>
                </div>
                <Button variant="link" className="mt-6" onClick={() => jumpToTabWithFilter('policies', 'action', 'all')}>
                  View All Devices & Policies
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="space-y-4">
          <Card className="border-t-4 border-t-blue-500 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle>USB Access Policies</CardTitle>
                  <CardDescription>Rules defining which devices are allowed or blocked from using USB mass storage.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search Device / IP..."
                      className="pl-9"
                      value={policySearch}
                      onChange={(e) => {
                        setPolicySearch(e.target.value);
                        setPolicyPage(1);
                      }}
                    />
                  </div>
                  <Select value={policyActionFilter} onValueChange={(val) => {
                    setPolicyActionFilter(val);
                    setPolicyPage(1);
                  }}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="allow">Allowed</SelectItem>
                      <SelectItem value="block">Blocked</SelectItem>
                      <SelectItem value="readonly">Read-Only</SelectItem>
                    </SelectContent>
                  </Select>

                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading && policies.length === 0 ? (
                <div className="py-12 flex justify-center"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" /></div>
              ) : policies.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center">
                  <Shield className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-xl font-semibold">No Policies Found</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">No USB access policies match your current search criteria. Try adjusting the filters or create a new policy.</p>
                  {(policySearch || policyActionFilter !== 'all') && (
                    <Button variant="outline" className="mt-4" onClick={() => { setPolicySearch(''); setPolicyActionFilter('all'); }}>Clear Filters</Button>
                  )}
                </div>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4 font-medium">Target Level</th>
                        <th className="px-6 py-4 font-medium">Target ID</th>
                        <th className="px-6 py-4 font-medium">Action</th>
                        <th className="px-6 py-4 font-medium">Created By</th>
                        <th className="px-6 py-4 font-medium">Last Updated</th>
                        <th className="px-6 py-4 text-right font-medium">Manage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(policies || []).map((p) => (
                        <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 font-medium capitalize">
                            {p.target_type === 'global' ? (
                              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Global</Badge>
                            ) : p.target_type === 'group' ? (
                              <Badge variant="outline">Group</Badge>
                            ) : (
                              <Badge variant="outline">Device</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-foreground font-mono">{p.target_id}</div>
                            {p.ip && <div className="text-[11px] text-muted-foreground mt-0.5">{p.ip}</div>}
                          </td>
                          <td className="px-6 py-4">
                            <Select
                              value={p.action}
                              onValueChange={(val) => handleUpdateAction(p, val)}
                            >
                              <SelectTrigger className={`h-8 w-[140px] ${p.action === 'block' ? 'border-destructive text-destructive' : p.action === 'allow' ? 'border-green-500 text-green-600' : 'border-amber-500 text-amber-600'}`}>
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
                          <td className="px-6 py-4 text-muted-foreground">{p.created_by}</td>
                          <td className="px-6 py-4 text-muted-foreground">{format(new Date(p.updated_at), 'MMM d, yyyy HH:mm')}</td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleDeletePolicy(p.id)} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {renderPagination(policyPage, policyTotal, setPolicyPage)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card className="border-t-4 border-t-indigo-500 shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <CardTitle>USB Activity Logs</CardTitle>
                  <CardDescription>Real-time notifications from agents when USB devices are inserted.</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search Hostname / IP / Device..."
                      className="pl-9"
                      value={eventSearch}
                      onChange={(e) => {
                        setEventSearch(e.target.value);
                        setEventPage(1);
                      }}
                    />
                  </div>
                  <Select value={eventActionFilter} onValueChange={(val) => {
                    setEventActionFilter(val);
                    setEventPage(1);
                  }}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                      <SelectValue placeholder="All Events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="allow">Allowed</SelectItem>
                      <SelectItem value="block">Blocked</SelectItem>
                      <SelectItem value="readonly">Read-Only</SelectItem>
                    </SelectContent>
                  </Select>

                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading && events.length === 0 ? (
                <div className="py-12 flex justify-center"><RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/50" /></div>
              ) : events.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center">
                  <Activity className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-xl font-semibold">No Activity Recorded</h3>
                  <p className="text-muted-foreground mt-2 max-w-md">No USB events match your current search criteria.</p>
                  {(eventSearch || eventActionFilter !== 'all') && (
                    <Button variant="outline" className="mt-4" onClick={() => { setEventSearch(''); setEventActionFilter('all'); }}>Clear Filters</Button>
                  )}
                </div>
              ) : (
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-6 py-4 font-medium">Timestamp</th>
                        <th className="px-6 py-4 font-medium">Endpoint</th>
                        <th className="px-6 py-4 font-medium">Hardware Info</th>
                        <th className="px-6 py-4 font-medium">Product Name</th>
                        <th className="px-6 py-4 font-medium">Action Taken</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(events || []).map((e) => (
                        <tr key={e.id} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                            {format(new Date(e.timestamp), 'MMM d, yyyy HH:mm:ss')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold">{e.hostname}</div>
                            {e.ip && <div className="text-[11px] text-muted-foreground mt-0.5">{e.ip}</div>}
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">{e.device_id}</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-[11px] text-muted-foreground">
                            <div>VID_{e.vendor_id}&PID_{e.product_id}</div>
                            <div className="mt-0.5">SN: {e.serial_number || 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium truncate max-w-[200px]" title={e.product_name}>{e.product_name || 'Unknown USB Device'}</div>
                            <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{e.manufacturer || 'Unknown Vendor'}</div>
                          </td>
                          <td className="px-6 py-4">
                            {e.action_taken === 'BLOCKED' ? (
                              <Badge variant="destructive" className="shadow-sm">BLOCKED</Badge>
                            ) : e.action_taken === 'ALLOWED' ? (
                              <Badge className="bg-green-500 hover:bg-green-600 text-white border-transparent shadow-sm">ALLOWED</Badge>
                            ) : (
                              <Badge variant="secondary" className="shadow-sm">{e.action_taken}</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {renderPagination(eventPage, eventTotal, setEventPage)}
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
