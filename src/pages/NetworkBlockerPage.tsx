import React, { useState, useEffect } from 'react';
import { Shield, Trash2, Globe, Server, Users, Search, Folder, Plus, Check, X, ShieldAlert, Activity, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function NetworkBlockerPage() {
  const [activeTab, setActiveTab] = useState<'policies' | 'groups'>('policies');
  
  // Policies State
  const [policies, setPolicies] = useState([]);
  const [devices, setDevices] = useState([]);
  const [groups, setGroups] = useState([]);
  const [summary, setSummary] = useState<any>(null);
  
  const [policyType, setPolicyType] = useState<'domain' | 'site_group'>('domain');
  const [domain, setDomain] = useState('');
  const [siteGroupId, setSiteGroupId] = useState('');
  
  const [targetType, setTargetType] = useState('global');
  const [targetId, setTargetId] = useState('');
  
  const [deviceSearch, setDeviceSearch] = useState('');
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  
  // Site Groups State
  const [siteGroups, setSiteGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  
  // Site Group Items State
  const [selectedSiteGroup, setSelectedSiteGroup] = useState<any>(null);
  const [newSiteDomain, setNewSiteDomain] = useState('');

  const [loading, setLoading] = useState(true);

  const filteredDevices = devices.filter((d: any) => 
    (d.hostname && d.hostname.toLowerCase().includes(deviceSearch.toLowerCase())) || 
    (d.ip && d.ip.includes(deviceSearch))
  );

  useEffect(() => {
    fetchData();
    fetchSiteGroups();
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/network-policies/summary').then(r => r.json());
      if (res.success) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [polRes, devRes, grpRes] = await Promise.all([
        fetch('/api/network-policies').then(r => r.json()),
        fetch('/api/devices').then(r => r.json()),
        fetch('/api/groups').then(r => r.json())
      ]);
      
      if (polRes.success) setPolicies(polRes.policies);
      
      if (Array.isArray(devRes)) setDevices(devRes);
      else if (devRes.devices) setDevices(devRes.devices);
      
      if (Array.isArray(grpRes)) setGroups(grpRes);
      else if (grpRes.groups) setGroups(grpRes.groups);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch data from server');
    }
    setLoading(false);
  };

  const fetchSiteGroups = async () => {
    try {
      const res = await fetch('/api/network-policies/site-groups').then(r => r.json());
      if (res.success) {
        setSiteGroups(res.siteGroups);
        if (selectedSiteGroup) {
          const updated = res.siteGroups.find((g: any) => g.id === selectedSiteGroup.id);
          if (updated) setSelectedSiteGroup(updated);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (policyType === 'domain' && !domain) return;
    if (policyType === 'site_group' && !siteGroupId) return;
    
    try {
      const res = await fetch('/api/network-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          domain: policyType === 'domain' ? domain : null,
          site_group_id: policyType === 'site_group' ? siteGroupId : null,
          target_type: targetType,
          target_id: targetType === 'global' ? null : targetId
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Policy successfully added');
        setDomain('');
        setSiteGroupId('');
        setTargetType('global');
        setTargetId('');
        setDeviceSearch('');
        fetchData();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to add policy');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  const handleDeletePolicy = async (id: number) => {
    if (!confirm('Are you sure you want to delete this policy?')) return;
    
    try {
      const res = await fetch('/api/network-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Policy deleted');
        fetchData();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  const handleTogglePolicy = async (id: number, currentStatus: boolean) => {
    try {
      const res = await fetch('/api/network-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_status', id, is_active: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Policy ${!currentStatus ? 'activated' : 'deactivated'}`);
        fetchData();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to change status');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  const handleCreateSiteGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    try {
      const res = await fetch('/api/network-policies/site-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName, description: newGroupDesc })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Site Group successfully created');
        setNewGroupName('');
        setNewGroupDesc('');
        fetchSiteGroups();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to create group');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  const handleDeleteSiteGroup = async (id: number) => {
    if (!confirm('Are you sure you want to delete this site group? All policies using this group might be affected.')) return;
    try {
      const res = await fetch('/api/network-policies/site-groups/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Group deleted');
        if (selectedSiteGroup?.id === id) setSelectedSiteGroup(null);
        fetchSiteGroups();
        fetchData(); // Refresh policies in case they relied on this
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  const handleAddSiteDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSiteGroup || !newSiteDomain) return;
    try {
      const res = await fetch('/api/network-policies/site-group-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: selectedSiteGroup.id, domain: newSiteDomain })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Domain added to group');
        setNewSiteDomain('');
        fetchSiteGroups();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to add domain');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  const handleDeleteSiteDomain = async (id: number) => {
    try {
      const res = await fetch('/api/network-policies/site-group-items/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Domain deleted from group');
        fetchSiteGroups();
        fetchSummary();
      } else {
        toast.error(data.error || 'Failed to delete domain');
      }
    } catch (err) {
      toast.error('Network error occurred');
    }
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-red-600" />
            Network Blocker
          </h1>
          <p className="text-muted-foreground mt-1">
            Centrally block internet access (Sites/Domains) at the OS level.
          </p>
        </div>
      </div>

      {/* DASHBOARD CARDS */}
      {activeTab === 'policies' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 animate-in fade-in slide-in-from-top-2">
          <Card className="border-l-4 border-l-red-500 bg-gradient-to-br from-card to-red-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Active Policies</CardTitle>
              <ShieldAlert className="h-5 w-5 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600 dark:text-red-400">{summary?.active_policies || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Rules actively enforced</p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-blue-500 bg-gradient-to-br from-card to-blue-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
              <Activity className="h-5 w-5 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summary?.total_policies || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Total configured rules</p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-purple-500 bg-gradient-to-br from-card to-purple-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Site Groups</CardTitle>
              <Folder className="h-5 w-5 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{summary?.total_site_groups || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Contains {summary?.total_domains_in_groups || 0} domains</p>
            </CardContent>
          </Card>
          
          <Card className="border-l-4 border-l-green-500 bg-gradient-to-br from-card to-green-500/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Endpoints Linked</CardTitle>
              <Users className="h-5 w-5 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{summary?.total_devices || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">Total devices available</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TABS */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6 max-w-md">
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${activeTab === 'policies' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Globe className="w-4 h-4 inline-block mr-2" />
          Block Policies
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all ${activeTab === 'groups' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Folder className="w-4 h-4 inline-block mr-2" />
          Site Groups
        </button>
      </div>

      {activeTab === 'policies' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Form Tambah Kebijakan */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-1 h-fit">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2 text-gray-800">Add New Policy</h2>
            <form onSubmit={handleAddPolicy} className="space-y-4">
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Policy Type</label>
                <div className="flex space-x-4">
                  <label className="flex items-center cursor-pointer">
                    <input type="radio" className="text-red-600 focus:ring-red-500" checked={policyType === 'domain'} onChange={() => setPolicyType('domain')} />
                    <span className="ml-2 text-sm text-gray-700">Single Domain</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input type="radio" className="text-red-600 focus:ring-red-500" checked={policyType === 'site_group'} onChange={() => setPolicyType('site_group')} />
                    <span className="ml-2 text-sm text-gray-700">Site Group</span>
                  </label>
                </div>
              </div>

              {policyType === 'domain' ? (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domain (Site)</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <input 
                      type="text" 
                      value={domain}
                      onChange={e => setDomain(e.target.value)}
                      placeholder="e.g. facebook.com"
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 transition-shadow"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Site Group</label>
                  <div className="relative">
                    <Folder className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <select 
                      value={siteGroupId}
                      onChange={e => setSiteGroupId(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 transition-shadow appearance-none"
                      required
                    >
                      <option value="">-- Select Site Group --</option>
                      {siteGroups.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.domains?.length || 0} domains)</option>)}
                    </select>
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Scope</label>
                <select 
                  value={targetType}
                  onChange={e => { setTargetType(e.target.value); setTargetId(''); setDeviceSearch(''); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="global">🌍 Global (All PCs)</option>
                  <option value="group">👥 Specific Group</option>
                  <option value="device">💻 Specific PC</option>
                </select>
              </div>

              {targetType === 'group' && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Group</label>
                  <select 
                    value={targetId}
                    onChange={e => setTargetId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  >
                    <option value="">-- Select Group --</option>
                    {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}

              {targetType === 'device' && (
                <div className="animate-in fade-in slide-in-from-top-2 relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select PC</label>
                  <div className="relative">
                    <div className="flex items-center border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-red-500 bg-white">
                      <Search className="w-4 h-4 ml-3 text-gray-400" />
                      <input 
                        type="text"
                        className="w-full px-3 py-2 outline-none rounded-md"
                        placeholder="Search hostname or IP..."
                        value={deviceSearch}
                        onChange={e => {
                          setDeviceSearch(e.target.value);
                          setIsDeviceDropdownOpen(true);
                          setTargetId(''); // reset target
                        }}
                        onFocus={() => setIsDeviceDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsDeviceDropdownOpen(false), 200)}
                        required={!targetId}
                      />
                    </div>
                    {isDeviceDropdownOpen && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredDevices.length > 0 ? (
                          filteredDevices.map((d: any) => (
                            <div 
                              key={d.id}
                              className={`px-4 py-2 cursor-pointer text-sm transition-colors ${targetId === d.id ? 'bg-red-50 text-red-700' : 'hover:bg-gray-50 text-gray-700'}`}
                              onClick={() => {
                                setTargetId(d.id);
                                setDeviceSearch(`${d.hostname} (${d.ip})`);
                                setIsDeviceDropdownOpen(false);
                              }}
                            >
                              <div className="font-medium">{d.hostname}</div>
                              <div className="text-xs text-gray-500">{d.ip}</div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-gray-500 text-center">PC not found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button 
                type="submit" 
                className="w-full mt-2 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors shadow-sm flex justify-center items-center"
              >
                <Shield className="w-4 h-4 mr-2" />
                Apply Policy
              </button>
            </form>
          </div>

          {/* Tabel Daftar */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-3">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold text-gray-800">Blocked Sites List</h2>
              <button 
                onClick={() => { fetchData(); fetchSummary(); }} 
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-3 py-1 rounded-md hover:bg-gray-100"
              >
                Refresh Data
              </button>
            </div>
            
            <div className="overflow-x-auto rounded-lg border border-gray-100">
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="bg-gray-50 text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 font-medium">Site / Group</th>
                    <th className="px-4 py-3 font-medium">Target Scope</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                    <th className="px-4 py-3 font-medium">Last Polling</th>
                    <th className="px-4 py-3 font-medium">Sync Status</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        <div className="flex flex-col items-center justify-center text-gray-400">
                          <Search className="w-6 h-6 animate-pulse mb-2" />
                          <span>Loading data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : policies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">
                        <div className="flex flex-col items-center justify-center">
                          <Shield className="w-8 h-8 text-gray-300 mb-2" />
                          <p>No active block policies.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    policies.map((p: any) => {
                      const updatedDate = p.updated_at ? new Date(p.updated_at) : new Date(p.created_at || Date.now());
                      const pollDate = p.last_network_poll ? new Date(p.last_network_poll) : null;
                      const isPendingSync = p.target_type === 'device' && (!pollDate || pollDate < updatedDate);
                      
                      return (
                        <tr key={p.id} className={`transition-colors ${p.is_active ? 'hover:bg-gray-50' : 'bg-gray-50 opacity-70'}`}>
                          <td className="px-4 py-3 font-medium text-gray-900 flex items-center mt-1">
                            {p.domain ? (
                              <><Globe className="w-4 h-4 mr-2 text-red-500" /> {p.domain}</>
                            ) : (
                              <><Folder className="w-4 h-4 mr-2 text-purple-500" /> {p.site_group_name}</>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {p.target_type === 'global' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100"><Globe className="w-3 h-3 mr-1"/> Global</span>}
                            {p.target_type === 'group' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-medium border border-purple-100"><Users className="w-3 h-3 mr-1"/> Group: {p.target_name}</span>}
                            {p.target_type === 'device' && <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 text-xs font-medium border border-orange-100"><Server className="w-3 h-3 mr-1"/> PC: {p.target_name}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <button 
                              onClick={() => handleTogglePolicy(p.id, p.is_active)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${p.is_active ? 'bg-red-600' : 'bg-gray-300'}`}
                            >
                              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${p.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {format(updatedDate, 'MMM d, HH:mm')}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {pollDate ? format(pollDate, 'MMM d, HH:mm') : '-'}
                          </td>
                          <td className="px-4 py-3">
                            {p.target_type === 'device' ? (
                              isPendingSync ? (
                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending Sync</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Synced</Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600">Multiple Devices</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button 
                              onClick={() => handleDeletePolicy(p.id)}
                              className="text-gray-400 hover:text-red-600 p-2 rounded-md hover:bg-red-50 transition-colors"
                              title="Delete policy"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daftar Grup */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-1 h-fit flex flex-col">
            <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl">
              <h2 className="font-semibold text-gray-800">Site Groups List</h2>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <form onSubmit={handleCreateSiteGroup} className="mb-4">
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="New Group Name..."
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  />
                  <button type="submit" className="bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-md transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </form>
              
              <div className="space-y-2">
                {siteGroups.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No site groups available</p>
                ) : (
                  siteGroups.map((g: any) => (
                    <div 
                      key={g.id} 
                      onClick={() => setSelectedSiteGroup(g)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${selectedSiteGroup?.id === g.id ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-red-300'}`}
                    >
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{g.name}</div>
                        <div className="text-xs text-gray-500">{g.domains?.length || 0} Registered Domains</div>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeleteSiteGroup(g.id); }}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Item Grup */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 lg:col-span-2 flex flex-col h-fit min-h-[400px]">
            {selectedSiteGroup ? (
              <>
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                  <div>
                    <h2 className="font-semibold text-gray-800 flex items-center">
                      <Folder className="w-4 h-4 mr-2 text-purple-600" />
                      Group: {selectedSiteGroup.name}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">Manage domains within this group</p>
                  </div>
                </div>
                
                <div className="p-6 flex-1">
                  <form onSubmit={handleAddSiteDomain} className="flex space-x-3 mb-6">
                    <div className="relative flex-1">
                      <Globe className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                      <input 
                        type="text" 
                        value={newSiteDomain}
                        onChange={e => setNewSiteDomain(e.target.value)}
                        placeholder="e.g. facebook.com"
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                        required
                      />
                    </div>
                    <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center">
                      <Plus className="w-4 h-4 mr-1" /> Add Domain
                    </button>
                  </form>
                  
                  <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-left text-sm text-gray-600">
                      <tbody className="divide-y divide-gray-200">
                        {!selectedSiteGroup.items || selectedSiteGroup.items.length === 0 ? (
                          <tr>
                            <td className="text-center py-8 text-gray-500">No domains in this group</td>
                          </tr>
                        ) : (
                          selectedSiteGroup.items.map((item: any) => (
                            <tr key={item.id} className="hover:bg-white transition-colors">
                              <td className="px-4 py-3 font-medium text-gray-800">{item.domain}</td>
                              <td className="px-4 py-3 text-right">
                                <button 
                                  onClick={() => handleDeleteSiteDomain(item.id)}
                                  className="text-gray-400 hover:text-red-600 transition-colors"
                                >
                                  <X className="w-4 h-4 inline" />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
                <Folder className="w-16 h-16 mb-4 text-gray-200" />
                <p className="text-lg font-medium text-gray-500">Select a Site Group</p>
                <p className="text-sm mt-1">Select a group from the left to view and manage its contents.</p>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
