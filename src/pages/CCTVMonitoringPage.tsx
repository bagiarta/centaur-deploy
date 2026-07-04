import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Video, 
  HardDrive, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Plus,
  MapPin,
  Loader2,
  Eye,
  Edit,
  Trash2,
  Save,
  Monitor,
  Signal,
  Clock,
  Database,
  TrendingUp,
  Search,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CCTVDevice {
  id: string;
  name: string;
  device_type: string;
  vendor: string;
  model?: string;
  ip_address: string;
  port: number;
  username: string;
  status: string;
  location_id?: string;
  location_name?: string;
  is_https?: boolean;
  poll_interval?: number;
  last_seen?: string;
  last_poll?: string;
  created_at?: string;
  updated_at?: string;
  channels?: CCTVChannel[];
  storage?: CCTVStorage[];
}

interface CCTVChannel {
  id: string;
  channel_number: number;
  channel_name: string;
  channel_settings?: string;
  status: string;
  is_enabled: boolean;
}

interface CCTVStorage {
  id: string;
  disk_number: number;
  disk_name: string;
  total_space: number;
  used_space: number;
  free_space: number;
  usage_percentage: number;
  status: string;
  disk_type: string;
}

interface DashboardStats {
  devices: {
    total_devices: number;
    online_devices: number;
    offline_devices: number;
    error_devices: number;
  };
  channels: {
    total_channels: number;
    online_channels: number;
    offline_channels: number;
    recording_channels: number;
  };
  storage: {
    total_disks: number;
    normal_disks: number;
    error_disks: number;
    critical_disks: number;
    warning_disks: number;
  };
}

interface CCTVLocation {
  id: string;
  name: string;
  address?: string;
  device_count?: number;
}

interface DeviceFormData {
  ipAddress: string;
  port: number;
  username: string;
  password: string;
  isHttps: boolean;
  locationId: string;
  name?: string; // Optional - will use discovered name if empty
}

export default function CCTVMonitoringPage() {
  const [devices, setDevices] = useState<CCTVDevice[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [locations, setLocations] = useState<CCTVLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [deviceTime, setDeviceTime] = useState<{localTime?: string; timeZone?: string} | null>(null);
  const [loadingTime, setLoadingTime] = useState(false);
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredData, setDiscoveredData] = useState<any>(null);
  const [selectedDevice, setSelectedDevice] = useState<CCTVDevice | null>(null);
  const [deviceToDelete, setDeviceToDelete] = useState<CCTVDevice | null>(null);
  const [showOfflineChannels, setShowOfflineChannels] = useState(true); // Default expanded
  
  const [formData, setFormData] = useState<DeviceFormData>({
    ipAddress: '',
    port: 80,
    username: 'admin',
    password: '',
    isHttps: false,
    locationId: '',
    name: ''
  });

  const silentPollStatus = async () => {
    try {
      await fetch('/api/cctv/poll-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      fetchData();
    } catch (error) {
      console.error('Silent poll failed:', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLocations();
    const interval = setInterval(() => {
      silentPollStatus();
    }, 60000); // Automatically check device statuses every 1 minute
    return () => clearInterval(interval);
  }, []);

  const fetchLocations = async () => {
    try {
      const response = await fetch('/api/cctv/locations');
      if (response.ok) {
        const data = await response.json();
        setLocations(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchData = async () => {
    try {
      const timestamp = new Date().getTime();
      const [devicesRes, dashboardRes] = await Promise.all([
        fetch(`/api/cctv/devices?_t=${timestamp}`, { cache: 'no-store' }),
        fetch(`/api/cctv/dashboard?_t=${timestamp}`, { cache: 'no-store' })
      ]);

      if (devicesRes.ok) {
        const devicesData = await devicesRes.json();
        setDevices(devicesData.data || []);
      }

      if (dashboardRes.ok) {
        const dashboardData = await dashboardRes.json();
        setDashboard(dashboardData.data);
      }
    } catch (error) {
      console.error('Error fetching CCTV data:', error);
      toast.error('Failed to fetch CCTV data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCheckStatus = async () => {
    setPolling(true);
    toast.info('Checking device status...');

    try {
      const response = await fetch('/api/cctv/poll-now', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(`Status updated! ${result.data.online} online, ${result.data.offline} offline`);
        // Refresh data to show updated status
        fetchData();
      } else {
        toast.error('Failed to check status');
      }
    } catch (error) {
      console.error('Error checking status:', error);
      toast.error('Failed to check status');
    } finally {
      setPolling(false);
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/cctv/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name || undefined, // Will use discovered name if empty
          deviceType: 'NVR', // Default, will be updated by polling
          vendor: 'Hikvision', // Default for now
          ipAddress: formData.ipAddress,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          isHttps: formData.isHttps,
          locationId: formData.locationId,
          autoDiscover: true // Enable auto-discovery
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success(`Device added! Discovered ${result.data.channels || 0} channels, ${result.data.storage || 0} storage devices`);
        setDialogOpen(false);
        setDiscoveredData(null);
        // Reset form
        setFormData({
          ipAddress: '',
          port: 80,
          username: 'admin',
          password: '',
          isHttps: false,
          locationId: '',
          name: ''
        });
        // Refresh devices list
        fetchData();
      } else {
        toast.error(result.error || 'Failed to add device');
      }
    } catch (error) {
      console.error('Error adding device:', error);
      toast.error('Failed to add device');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof DeviceFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTestConnection = async () => {
    if (!formData.ipAddress || !formData.username || !formData.password) {
      toast.error('Please fill IP Address, Username, and Password first');
      return;
    }

    setTesting(true);

    try {
      const response = await fetch('/api/cctv/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ipAddress: formData.ipAddress,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          isHttps: formData.isHttps
        }),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Connection successful! Device is reachable.');
      } else {
        toast.error(result.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Error testing connection:', error);
      toast.error('Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleDiscoverDevice = async () => {
    if (!formData.ipAddress || !formData.username || !formData.password) {
      toast.error('Please fill IP Address, Username, and Password first');
      return;
    }

    setDiscovering(true);
    setDiscoveredData(null);

    try {
      const response = await fetch('/api/cctv/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ipAddress: formData.ipAddress,
          port: formData.port,
          username: formData.username,
          password: formData.password,
          isHttps: formData.isHttps
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setDiscoveredData(result.data);
        toast.success(`Discovery complete! Found ${result.data.channels.length} channels, ${result.data.storage.length} storage devices`);
        
        // Auto-fill device name if discovered
        if (result.data.device && result.data.device.deviceName && !formData.name) {
          setFormData(prev => ({ ...prev, name: result.data.device.deviceName }));
        }
      } else {
        toast.error(result.error || 'Discovery failed');
      }
    } catch (error) {
      console.error('Error discovering device:', error);
      toast.error('Failed to discover device');
    } finally {
      setDiscovering(false);
    }
  };

  const handleViewDevice = async (device: CCTVDevice) => {
    setSelectedDevice(device);
    setViewDialogOpen(true);
    setLoadingDetails(true);
    setDeviceTime(null);
    setLoadingTime(true);

    // Fetch device details and system time in parallel
    try {
      const [detailRes, timeRes] = await Promise.allSettled([
        fetch(`/api/cctv/devices/${device.id}`, { cache: 'no-store' }),
        fetch(`/api/cctv/devices/${device.id}/time`, { cache: 'no-store' })
      ]);

      if (detailRes.status === 'fulfilled' && detailRes.value.ok) {
        const result = await detailRes.value.json();
        if (result.success && result.data) setSelectedDevice(result.data);
      } else {
        toast.error('Failed to load full device details');
      }

      if (timeRes.status === 'fulfilled' && timeRes.value.ok) {
        const timeResult = await timeRes.value.json();
        if (timeResult.success && timeResult.data) setDeviceTime(timeResult.data);
      }
    } catch (error) {
      console.error('Error fetching device details:', error);
      toast.error('Failed to load full device details');
    } finally {
      setLoadingDetails(false);
      setLoadingTime(false);
    }
  };

  const handleEditDevice = (device: CCTVDevice) => {
    setSelectedDevice(device);
    setFormData({
      ipAddress: device.ip_address,
      port: device.port,
      username: device.username,
      password: '', // Don't populate password for security
      isHttps: device.is_https || false,
      locationId: device.location_id || '',
      name: device.name
    });
    setEditDialogOpen(true);
  };

  const handleSyncDevice = async () => {
    if (!selectedDevice) return;
    setSyncing(true);
    try {
      const response = await fetch(`/api/cctv/devices/${selectedDevice.id}/sync`, { method: 'POST' });
      const result = await response.json();
      if (response.ok && result.success) {
        toast.success(result.message || 'Device synced successfully');
        fetchData(); // Refresh list to get updated channel counts
        setEditDialogOpen(false);
      } else {
        toast.error(result.error || 'Failed to sync device');
      }
    } catch (error) {
      console.error('Error syncing device:', error);
      toast.error('Failed to connect to server');
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    
    setSubmitting(true);

    try {
      const updateData: any = {
        name: formData.name,
        ip_address: formData.ipAddress,
        port: formData.port,
        username: formData.username,
        is_https: formData.isHttps,
        location_id: formData.locationId
      };

      // Only include password if it was changed
      if (formData.password) {
        updateData.password = formData.password;
      }

      const response = await fetch(`/api/cctv/devices/${selectedDevice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Device updated successfully!');
        setEditDialogOpen(false);
        setSelectedDevice(null);
        fetchData();
      } else {
        toast.error(result.error || 'Failed to update device');
      }
    } catch (error) {
      console.error('Error updating device:', error);
      toast.error('Failed to update device');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (device: CCTVDevice) => {
    setDeviceToDelete(device);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deviceToDelete) return;

    setSubmitting(true);

    try {
      const response = await fetch(`/api/cctv/devices/${deviceToDelete.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        toast.success('Device deleted successfully!');
        setDeleteDialogOpen(false);
        setDeviceToDelete(null);
        fetchData();
      } else {
        toast.error(result.error || 'Failed to delete device');
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      toast.error('Failed to delete device');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Online</Badge>;
      case 'offline':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Offline</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-8 shadow-2xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10 flex justify-between items-center text-white">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                  <Video className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight">CCTV Monitoring</h1>
                  <p className="text-blue-100 mt-1 text-lg">Real-time Security Surveillance System</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button 
                onClick={handleCheckStatus} 
                variant="secondary" 
                disabled={polling}
                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-white/30 shadow-lg"
              >
                <Activity className={`w-5 h-5 mr-2 ${polling ? 'animate-pulse' : ''}`} />
                {polling ? 'Checking...' : 'Check Status'}
              </Button>
              <Button 
                onClick={handleRefresh} 
                variant="secondary" 
                disabled={refreshing}
                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-white/30 shadow-lg"
              >
                <RefreshCw className={`w-5 h-5 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                onClick={() => setDialogOpen(true)}
                className="bg-white text-blue-600 hover:bg-blue-50 shadow-lg font-semibold"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Device
              </Button>
            </div>
          </div>
        </div>

        {/* Enhanced Dashboard Statistics */}
        {dashboard && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {/* Total Devices Card */}
            <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
                <CardTitle className="text-sm font-medium text-blue-100">Total Devices</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Monitor className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-bold">{dashboard.devices.total_devices}</div>
                <div className="flex gap-3 mt-3 text-sm">
                  <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-md">
                    <CheckCircle className="w-3 h-3" />
                    <span className="font-medium">{dashboard.devices.online_devices} Online</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded-md">
                    <XCircle className="w-3 h-3" />
                    <span>{dashboard.devices.offline_devices} Off</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Channels Card */}
            <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-purple-600 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
                <CardTitle className="text-sm font-medium text-purple-100">Active Channels</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Video className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-bold">{dashboard.channels.total_channels}</div>
                <div className="flex gap-3 mt-3 text-sm">
                  <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-md">
                    <Signal className="w-3 h-3" />
                    <span className="font-medium">{dashboard.channels.online_channels} Active</span>
                  </div>
                  <div className="flex items-center gap-1 bg-red-500/30 px-2 py-1 rounded-md">
                    <Activity className="w-3 h-3" />
                    <span>{dashboard.channels.recording_channels} Rec</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Storage Card */}
            <Card className="border-0 shadow-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
                <CardTitle className="text-sm font-medium text-emerald-100">Storage Devices</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <Database className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-bold">{dashboard.storage.total_disks}</div>
                <div className="flex gap-3 mt-3 text-sm">
                  <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-md">
                    <CheckCircle className="w-3 h-3" />
                    <span className="font-medium">{dashboard.storage.normal_disks} Normal</span>
                  </div>
                  <div className="flex items-center gap-1 bg-orange-500/40 px-2 py-1 rounded-md">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{dashboard.storage.critical_disks} Critical</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Alerts Card */}
            <Card className="border-0 shadow-xl bg-gradient-to-br from-orange-500 to-red-600 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
                <CardTitle className="text-sm font-medium text-orange-100">Active Alerts</CardTitle>
                <div className="p-2 bg-white/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-bold">
                  {dashboard.storage.error_disks + dashboard.devices.error_devices + dashboard.channels.offline_channels}
                </div>
                <p className="text-sm text-orange-100 mt-3 bg-white/10 px-2 py-1 rounded-md inline-block">
                  Requiring immediate attention
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Offline Channels Section */}
        {dashboard && dashboard.channels.offline_channels > 0 && (
          <Card className="border-0 shadow-xl bg-gradient-to-br from-red-50 to-orange-50">
            <CardHeader 
              className="border-b border-red-100 cursor-pointer hover:bg-red-100/50 transition-colors"
              onClick={() => setShowOfflineChannels(!showOfflineChannels)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <CardTitle className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-red-600" />
                    Offline Channels Alert
                    <ChevronRight className={cn(
                      "w-5 h-5 text-gray-500 transition-transform duration-200",
                      showOfflineChannels && "rotate-90"
                    )} />
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    {dashboard.channels.offline_channels} channel(s) currently offline - {showOfflineChannels ? 'Click to hide' : 'Click to view details'}
                  </p>
                </div>
              </div>
            </CardHeader>
            
            {showOfflineChannels && (
              <CardContent className="pt-4 animate-in slide-in-from-top duration-300">
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {devices
                    .filter(device => device.channels && device.channels.some((ch: CCTVChannel) => 
                      ch.status === 'offline' || ch.status === 'video_loss' || ch.status === 'no_signal'
                    ))
                    .map(device => {
                      const offlineChannels = device.channels?.filter((ch: CCTVChannel) => 
                        ch.status === 'offline' || ch.status === 'video_loss' || ch.status === 'no_signal'
                      ) || [];
                      return offlineChannels.map((channel: CCTVChannel) => (
                        <button
                          key={`${device.id}-${channel.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('Clicked offline channel:', channel.channel_name, 'from device:', device.name);
                            handleViewDevice(device);
                          }}
                          className="p-4 bg-white rounded-lg border-2 border-red-200 hover:border-red-400 hover:shadow-lg transition-all cursor-pointer group text-left w-full"
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <div className="p-2 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors">
                                <Video className="w-4 h-4 text-red-600" />
                              </div>
                              <div>
                                <p className="font-bold text-gray-800 text-sm">{channel.channel_name}</p>
                                <p className="text-xs text-gray-500">Channel #{channel.channel_number}</p>
                              </div>
                            </div>
                            <Badge variant="secondary" className={
                              channel.status === 'video_loss' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                              channel.status === 'no_signal' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                              'bg-red-100 text-red-700 border-red-200'
                            }>
                              {channel.status === 'video_loss' ? 'Video Loss' :
                               channel.status === 'no_signal' ? 'No Signal' :
                               'Offline'}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <Monitor className="w-3 h-3 text-gray-500" />
                              <span className="text-gray-700 font-medium">{device.name}</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <Activity className="w-3 h-3 text-gray-500" />
                              <span className="text-gray-600 font-mono">{device.ip_address}</span>
                            </div>
                            {(() => {
                              try {
                                const settings = channel.channel_settings ? JSON.parse(channel.channel_settings) : null;
                                if (settings?.camera_ip) {
                                  return (
                                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                                      <Signal className="w-3 h-3 text-gray-500" />
                                      <span className="text-gray-600 font-mono">{settings.camera_ip}</span>
                                    </div>
                                  );
                                }
                              } catch (e) {
                                return null;
                              }
                              return null;
                            })()}
                          </div>
                          
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-1 text-xs text-blue-600 font-medium group-hover:text-blue-700">
                              <Eye className="w-3 h-3" />
                              <span>Click to view device details</span>
                            </div>
                          </div>
                        </button>
                      ));
                    })}
                </div>
              </CardContent>
            )}
          </Card>
        )}

      <div className="mb-6 space-y-4">
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input 
              placeholder="Search by device name, IP address, or location..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 border-gray-300 focus:border-blue-500 rounded-lg h-12 w-full"
            />
          </div>
          {searchQuery && (
            <Button variant="ghost" onClick={() => setSearchQuery('')} className="text-gray-500 hover:text-gray-700">
              Clear
            </Button>
          )}
        </div>

        {(() => {
          const filteredDevices = devices.filter(d => 
            d.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            d.ip_address.includes(searchQuery) ||
            (d.location_name && d.location_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (d.model && d.model.toLowerCase().includes(searchQuery.toLowerCase()))
          );

          return (
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-3 h-12 bg-white shadow-lg rounded-xl">
                <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-blue-500 data-[state=active]:text-white">
                  All Devices ({filteredDevices.length})
                </TabsTrigger>
                <TabsTrigger value="online" className="rounded-lg data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                  Online ({filteredDevices.filter(d => d.status === 'online').length})
                </TabsTrigger>
                <TabsTrigger value="offline" className="rounded-lg data-[state=active]:bg-red-500 data-[state=active]:text-white">
                  Offline ({filteredDevices.filter(d => d.status === 'offline').length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="space-y-4 mt-6">
                {filteredDevices.length === 0 ? (
                  <Card className="border-0 shadow-xl bg-white">
                    <CardContent className="flex flex-col items-center justify-center py-16">
                      <div className="p-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full mb-6">
                        <Video className="w-16 h-16 text-blue-600" />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-800 mb-2">No CCTV Devices Found</h3>
                      <p className="text-gray-500 mb-6">{searchQuery ? 'No devices match your search query.' : 'Get started by adding your first CCTV device'}</p>
                      {!searchQuery && (
                        <Button 
                          onClick={() => setDialogOpen(true)}
                          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                        >
                          <Plus className="w-5 h-5 mr-2" />
                          Add First Device
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredDevices.map((device) => (
                  <Card 
                    key={device.id} 
                    className={`border-0 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden ${
                      device.status === 'online' 
                        ? 'bg-gradient-to-br from-emerald-50 to-blue-50 hover:from-emerald-100 hover:to-blue-100' 
                        : 'bg-gradient-to-br from-gray-50 to-slate-100'
                    }`}
                  >
                    {/* Status Bar */}
                    <div className={`h-2 ${
                      device.status === 'online' ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-gray-400 to-slate-500'
                    }`}></div>
                    
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className={`p-2 rounded-lg ${
                              device.status === 'online' ? 'bg-emerald-100' : 'bg-gray-200'
                            }`}>
                              <Monitor className={`w-5 h-5 ${
                                device.status === 'online' ? 'text-emerald-600' : 'text-gray-600'
                              }`} />
                            </div>
                            <div>
                              <CardTitle className="text-lg font-bold text-gray-800">{device.name}</CardTitle>
                              <p className="text-sm text-gray-500">
                                {device.vendor} • {device.device_type}
                              </p>
                            </div>
                          </div>
                        </div>
                        {device.status === 'online' ? (
                          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-md">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-300 text-gray-700">
                            <XCircle className="w-3 h-3 mr-1" />
                            Offline
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-3">
                      {/* Location */}
                      <div className="flex items-center gap-2 p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-gray-700">
                          {device.location_name || 'No location'}
                        </span>
                      </div>
                      
                      {/* IP Address */}
                      <div className="flex items-center gap-2 p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                        <Activity className="w-4 h-4 text-purple-500" />
                        <span className="text-sm font-mono text-gray-700">
                          {device.ip_address}:{device.port}
                        </span>
                      </div>
                      
                      {/* Channels Status */}
                      {device.channels && device.channels.length > 0 && (
                        <div className="p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Video className="w-4 h-4 text-indigo-500" />
                              <span className="text-sm font-medium text-gray-700">Channels</span>
                            </div>
                            <span className="text-sm font-bold text-gray-800">
                              {device.channels.length}
                            </span>
                          </div>
                          {(() => {
                            const onlineCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'online').length;
                            const offlineCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'offline').length;
                            const videoLossCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'video_loss').length;
                            const noSignalCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'no_signal').length;
                            
                            return (
                              <div className="space-y-1 mt-2">
                                <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded text-xs">
                                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                                  <span className="text-emerald-700 font-medium">{onlineCount} Online</span>
                                </div>
                                {offlineCount > 0 && (
                                  <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded text-xs">
                                    <XCircle className="w-3 h-3 text-red-600" />
                                    <span className="text-red-700 font-medium">{offlineCount} Offline</span>
                                  </div>
                                )}
                                {videoLossCount > 0 && (
                                  <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded text-xs">
                                    <AlertTriangle className="w-3 h-3 text-orange-600" />
                                    <span className="text-orange-700 font-medium">{videoLossCount} Video Loss</span>
                                  </div>
                                )}
                                {noSignalCount > 0 && (
                                  <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded text-xs">
                                    <AlertTriangle className="w-3 h-3 text-yellow-600" />
                                    <span className="text-yellow-700 font-medium">{noSignalCount} No Signal</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      {/* Last Seen */}
                      {device.last_seen && (
                        <div className="flex items-center gap-2 p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                          <Clock className="w-4 h-4 text-orange-500" />
                          <div className="flex-1">
                            <p className="text-xs text-gray-500">Last seen</p>
                            <p className="text-sm font-medium text-gray-700">{device.last_seen}</p>
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="flex-1 bg-white hover:bg-blue-50 border-blue-200 text-blue-600" 
                          onClick={() => handleViewDevice(device)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="hover:bg-blue-50 text-blue-600"
                          onClick={() => handleEditDevice(device)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="hover:bg-red-50 text-red-500"
                          onClick={() => handleDeleteClick(device)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="online" className="space-y-4 mt-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredDevices.filter(d => d.status === 'online').map((device) => (
                <Card 
                  key={device.id} 
                  className="border-0 shadow-xl bg-gradient-to-br from-emerald-50 to-blue-50 hover:shadow-2xl transition-all"
                >
                  <div className="h-2 bg-gradient-to-r from-emerald-400 to-green-500"></div>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                          <Monitor className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{device.name}</CardTitle>
                          <p className="text-sm text-gray-500">{device.vendor} • {device.device_type}</p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-500 text-white">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Online
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 p-2 bg-white/60 rounded-lg text-sm">
                      <Activity className="w-4 h-4 text-purple-500" />
                      <span className="font-mono text-gray-700">{device.ip_address}:{device.port}</span>
                    </div>
                    
                    {/* Channels Status */}
                    {device.channels && device.channels.length > 0 && (
                      <div className="p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-indigo-500" />
                            <span className="text-sm font-medium text-gray-700">Channels</span>
                          </div>
                          <span className="text-sm font-bold text-gray-800">{device.channels.length}</span>
                        </div>
                        {(() => {
                          const onlineCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'online').length;
                          const offlineCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'offline').length;
                          const videoLossCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'video_loss').length;
                          const noSignalCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'no_signal').length;
                          
                          return (
                            <div className="space-y-1 mt-2">
                              <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded text-xs">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-700 font-medium">{onlineCount} Online</span>
                              </div>
                              {offlineCount > 0 && (
                                <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded text-xs">
                                  <XCircle className="w-3 h-3 text-red-600" />
                                  <span className="text-red-700 font-medium">{offlineCount} Offline</span>
                                </div>
                              )}
                              {videoLossCount > 0 && (
                                <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded text-xs">
                                  <AlertTriangle className="w-3 h-3 text-orange-600" />
                                  <span className="text-orange-700 font-medium">{videoLossCount} Video Loss</span>
                                </div>
                              )}
                              {noSignalCount > 0 && (
                                <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded text-xs">
                                  <AlertTriangle className="w-3 h-3 text-yellow-600" />
                                  <span className="text-yellow-700 font-medium">{noSignalCount} No Signal</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    
                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
                      <Button size="sm" variant="outline" className="flex-1 bg-white hover:bg-blue-50 border-blue-200 text-blue-600" onClick={() => handleViewDevice(device)}>
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="ghost" className="hover:bg-blue-50 text-blue-600" onClick={() => handleEditDevice(device)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="offline" className="space-y-4 mt-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredDevices.filter(d => d.status === 'offline').map((device) => (
                <Card 
                  key={device.id} 
                  className="border-0 shadow-xl bg-gradient-to-br from-gray-50 to-slate-100 hover:shadow-2xl transition-all"
                >
                  <div className="h-2 bg-gradient-to-r from-gray-400 to-slate-500"></div>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-200 rounded-lg">
                          <Monitor className="w-5 h-5 text-gray-600" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{device.name}</CardTitle>
                          <p className="text-sm text-gray-500">{device.vendor} • {device.device_type}</p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-gray-300 text-gray-700">
                        <XCircle className="w-3 h-3 mr-1" />
                        Offline
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 p-2 bg-white/60 rounded-lg text-sm">
                      <Activity className="w-4 h-4 text-purple-500" />
                      <span className="font-mono text-gray-700">{device.ip_address}:{device.port}</span>
                    </div>
                    
                    {/* Channels Status */}
                    {device.channels && device.channels.length > 0 && (
                      <div className="p-3 bg-white/60 backdrop-blur-sm rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Video className="w-4 h-4 text-indigo-500" />
                            <span className="text-sm font-medium text-gray-700">Channels</span>
                          </div>
                          <span className="text-sm font-bold text-gray-800">{device.channels.length}</span>
                        </div>
                        {(() => {
                          const onlineCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'online').length;
                          const offlineCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'offline').length;
                          const videoLossCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'video_loss').length;
                          const noSignalCount = device.channels.filter((ch: CCTVChannel) => ch.status === 'no_signal').length;
                          
                          return (
                            <div className="space-y-1 mt-2">
                              <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded text-xs">
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-700 font-medium">{onlineCount} Online</span>
                              </div>
                              {offlineCount > 0 && (
                                <div className="flex items-center gap-1 bg-red-50 px-2 py-1 rounded text-xs">
                                  <XCircle className="w-3 h-3 text-red-600" />
                                  <span className="text-red-700 font-medium">{offlineCount} Offline</span>
                                </div>
                              )}
                              {videoLossCount > 0 && (
                                <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded text-xs">
                                  <AlertTriangle className="w-3 h-3 text-orange-600" />
                                  <span className="text-orange-700 font-medium">{videoLossCount} Video Loss</span>
                                </div>
                              )}
                              {noSignalCount > 0 && (
                                <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded text-xs">
                                  <AlertTriangle className="w-3 h-3 text-yellow-600" />
                                  <span className="text-yellow-700 font-medium">{noSignalCount} No Signal</span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    
                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
                      <Button size="sm" variant="outline" className="flex-1 bg-white hover:bg-blue-50 border-blue-200 text-blue-600" onClick={() => handleViewDevice(device)}>
                        <Eye className="w-4 h-4 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="ghost" className="hover:bg-blue-50 text-blue-600" onClick={() => handleEditDevice(device)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
          );
        })()}
      </div>

      {/* Add Device Dialog - Simplified with Auto-Discovery */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New CCTV Device</DialogTitle>
            <DialogDescription>
              Enter IP, Username, and Password. Device info will be auto-discovered from Hikvision ISAPI.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleAddDevice} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* IP Address */}
              <div>
                <Label htmlFor="ipAddress">IP Address *</Label>
                <Input
                  id="ipAddress"
                  placeholder="e.g., 192.168.1.100"
                  value={formData.ipAddress}
                  onChange={(e) => handleInputChange('ipAddress', e.target.value)}
                  required
                />
              </div>

              {/* Port */}
              <div>
                <Label htmlFor="port">Port *</Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="80"
                  value={formData.port}
                  onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                  required
                />
              </div>

              {/* Username */}
              <div>
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  placeholder="admin"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  required
                />
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  required
                />
              </div>

              {/* HTTPS */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isHttps"
                  checked={formData.isHttps}
                  onChange={(e) => handleInputChange('isHttps', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="isHttps" className="cursor-pointer">
                  Use HTTPS
                </Label>
              </div>

              {/* Test Connection Button */}
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testing || !formData.ipAddress || !formData.username || !formData.password}
                  className="w-full"
                >
                  {testing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              {/* Discover Button */}
              <div className="col-span-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleDiscoverDevice}
                  disabled={discovering || !formData.ipAddress || !formData.username || !formData.password}
                  className="w-full"
                >
                  {discovering ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Discovering...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Auto-Discover Device Info
                    </>
                  )}
                </Button>
              </div>

              {/* Discovered Data Display */}
              {discoveredData && (
                <div className="col-span-2 border border-green-300 rounded-xl overflow-hidden">
                  {/* Header */}
                  <div className="bg-green-600 px-4 py-2.5 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-white" />
                    <p className="font-semibold text-white text-sm">Discovery Successful!</p>
                  </div>

                  <div className="bg-green-50 p-4 space-y-4">
                    {/* Device Info */}
                    {discoveredData.device && (
                      <div>
                        <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">Device Information</p>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Name</span>
                            <span className="font-medium">{discoveredData.device.deviceName || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Model</span>
                            <span className="font-medium">{discoveredData.device.deviceModel || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Type</span>
                            <span className="font-medium">{discoveredData.device.deviceType || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Firmware</span>
                            <span className="font-medium">{discoveredData.device.firmwareVersion || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">MAC Address</span>
                            <span className="font-mono text-xs">{discoveredData.device.macAddress || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">Serial Number</span>
                            <span className="font-mono text-xs truncate max-w-[140px]" title={discoveredData.device.serialNumber}>{discoveredData.device.serialNumber || 'N/A'}</span>
                          </div>
                          {discoveredData.device.localTime && (
                            <div className="col-span-2 flex justify-between border-t border-green-200 pt-1 mt-1">
                              <span className="text-gray-500">Device Time</span>
                              <span className="font-mono text-xs">{discoveredData.device.localTime} {discoveredData.device.timeZone && `(${discoveredData.device.timeZone})`}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Channels */}
                    <div>
                      <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
                        Channels ({discoveredData.channels?.length || 0})
                      </p>
                      {discoveredData.channels && discoveredData.channels.length > 0 ? (
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {discoveredData.channels.map((ch: any, i: number) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-green-100">
                              <span className="font-medium">Ch {ch.channel_number || ch.id}: {ch.channel_name || ch.name || `Channel ${i + 1}`}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${ch.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {ch.status || 'N/A'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No channels found</p>
                      )}
                    </div>

                    {/* Storage */}
                    <div>
                      <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">
                        Storage ({discoveredData.storage?.length || 0})
                      </p>
                      {discoveredData.storage && discoveredData.storage.length > 0 ? (
                        <div className="space-y-1">
                          {discoveredData.storage.map((disk: any, i: number) => (
                            <div key={i} className="text-xs bg-white rounded px-2 py-1 border border-green-100 flex items-center justify-between">
                              <span className="font-medium">{disk.name || disk.hddName || `Disk ${i + 1}`} ({disk.type || disk.hddType || 'HDD'})</span>
                              <div className="flex items-center gap-2">
                                {disk.capacity > 0 && (
                                  <span className="text-gray-500">{Math.round(disk.capacity / 1024)} GB · {disk.usagePercentage || disk.usage_percentage || 0}% used</span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${disk.status === 'ok' || disk.status === 'normal' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                  {disk.status || 'N/A'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No storage found</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Device Name (Optional) */}
              <div className="col-span-2">
                <Label htmlFor="name">Device Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="Leave empty to use discovered name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  If empty, will use name from device discovery
                </p>
              </div>

              {/* Location */}
              <div className="col-span-2">
                <Label htmlFor="location">Location (Optional)</Label>
                <Select
                  value={formData.locationId}
                  onValueChange={(value) => handleInputChange('locationId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  setDiscoveredData(null);
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Device
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Device Detail Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Device Details</DialogTitle>
            <DialogDescription>
              Complete information about the CCTV device
            </DialogDescription>
          </DialogHeader>
          
          {selectedDevice && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <h3 className="font-semibold text-lg">{selectedDevice.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedDevice.vendor} {selectedDevice.device_type}</p>
                </div>
                {getStatusBadge(selectedDevice.status)}
              </div>

              {/* System Time Card */}
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-full">
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider mb-1">Device System Time</p>
                  {loadingTime ? (
                    <div className="flex items-center gap-2 text-blue-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Fetching time from device...</span>
                    </div>
                  ) : deviceTime?.localTime ? (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1">
                      <span className="text-sm font-mono font-semibold text-blue-800">{deviceTime.localTime}</span>
                      {deviceTime.timeZone && (
                        <span className="text-xs text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">{deviceTime.timeZone}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-blue-400 italic">Could not retrieve device time</span>
                  )}
                </div>
              </div>

              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Device ID</Label>
                  <p className="font-mono text-sm">{selectedDevice.id}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Model</Label>
                  <p className="text-sm">{selectedDevice.model || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">IP Address</Label>
                  <p className="font-mono text-sm">{selectedDevice.ip_address}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Port</Label>
                  <p className="font-mono text-sm">{selectedDevice.port}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Username</Label>
                  <p className="text-sm">{selectedDevice.username}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Protocol</Label>
                  <p className="text-sm">{selectedDevice.is_https ? 'HTTPS' : 'HTTP'}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <p className="text-sm flex items-center">
                    <MapPin className="w-3 h-3 mr-1" />
                    {selectedDevice.location_name || 'No location'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Poll Interval</Label>
                  <p className="text-sm">{selectedDevice.poll_interval} seconds</p>
                </div>
              </div>

              {/* Detailed Info Tabs (Channels & Storage) */}
              {loadingDetails ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mb-2" />
                  <p className="text-sm">Loading details...</p>
                </div>
              ) : (
                <Tabs defaultValue="channels" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="channels">
                      <Video className="w-4 h-4 mr-2" />
                      Channels ({selectedDevice.channels?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="storage">
                      <Database className="w-4 h-4 mr-2" />
                      Storage ({selectedDevice.storage?.length || 0})
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="channels" className="mt-4">
                    {!selectedDevice.channels || selectedDevice.channels.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg border border-dashed">
                        <Video className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No cameras/channels found on this device.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedDevice.channels.map(channel => {
                          // Parse channel settings to get camera IP and other info
                          let cameraIP = 'No IP';
                          let resolution = null;
                          let codec = null;
                          
                          if (channel.channel_settings) {
                            try {
                              const settings = JSON.parse(channel.channel_settings);
                              cameraIP = settings.camera_ip || 'No IP';
                              resolution = settings.resolution || null;
                              codec = settings.codec || null;
                            } catch (e) {
                              // Invalid JSON, use default
                            }
                          }
                          
                          return (
                            <div key={channel.id} className={cn(
                              "flex flex-col p-3 border rounded-lg transition-colors",
                              channel.status === 'offline' 
                                ? "bg-red-50 border-red-200 hover:bg-red-100" 
                                : "bg-card hover:bg-accent/5"
                            )}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className={cn("w-2 h-2 rounded-full", channel.status === 'online' ? "bg-emerald-500" : (channel.status === 'recording' ? "bg-red-500 animate-pulse" : "bg-gray-400"))} />
                                  <div>
                                    <p className="text-sm font-semibold">CH {channel.channel_number}: {channel.channel_name || 'Camera'}</p>
                                    <p className="text-xs text-muted-foreground capitalize">{channel.status}</p>
                                  </div>
                                </div>
                                {channel.status === 'offline' ? (
                                  <Badge variant="destructive" className="text-xs">Offline</Badge>
                                ) : !channel.is_enabled ? (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>
                                ) : null}
                              </div>
                              
                              {/* Device Name - Always shown */}
                              <div className="flex items-center gap-2 mb-1 pl-5 text-xs">
                                <Monitor className="w-3 h-3 text-blue-500" />
                                <span className="font-medium text-blue-600">{selectedDevice.name}</span>
                              </div>
                              
                              {/* Camera IP and Details */}
                              <div className="flex flex-col gap-1 pl-5 text-xs">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Activity className="w-3 h-3" />
                                  <span className="font-mono">{cameraIP}</span>
                                </div>
                                {(resolution || codec) && (
                                  <div className="flex items-center gap-2 text-muted-foreground">
                                    {resolution && <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{resolution}</span>}
                                    {codec && <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{codec}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="storage" className="mt-4">
                    {!selectedDevice.storage || selectedDevice.storage.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground bg-muted/50 rounded-lg border border-dashed">
                        <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">No storage drives found on this device.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {selectedDevice.storage.map(disk => {
                          const isWarning = disk.status === 'warning' || disk.usage_percentage > 90;
                          const isError = disk.status === 'error' || disk.status === 'abnormal';
                          
                          return (
                            <div key={disk.id} className={cn("p-4 border rounded-lg", isError ? "bg-red-50/50 border-red-200" : (isWarning ? "bg-amber-50/50 border-amber-200" : "bg-card"))}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <HardDrive className={cn("w-4 h-4", isError ? "text-red-500" : (isWarning ? "text-amber-500" : "text-blue-500"))} />
                                  <p className="font-semibold text-sm">Disk {disk.disk_number}: {disk.disk_name}</p>
                                </div>
                                <Badge variant={isError ? "destructive" : (isWarning ? "default" : "outline")} className={isWarning && !isError ? "bg-amber-500 hover:bg-amber-600" : ""}>
                                  {disk.status || 'Unknown'}
                                </Badge>
                              </div>
                              
                              <div className="space-y-1">
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-muted-foreground">Usage</span>
                                  <span className="font-medium">{disk.usage_percentage}%</span>
                                </div>
                                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                  <div 
                                    className={cn("h-full rounded-full transition-all", isError ? "bg-red-500" : (isWarning ? "bg-amber-500" : "bg-emerald-500"))}
                                    style={{ width: `${disk.usage_percentage}%` }}
                                  />
                                </div>
                                <div className="flex justify-between text-xs mt-2 text-muted-foreground">
                                  <span>{Math.round(disk.used_space / 1024)} GB used</span>
                                  <span>{Math.round(disk.total_space / 1024)} GB total</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}

              {/* Timestamps */}
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">Activity</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Seen</Label>
                    <p className="text-sm">
                      {selectedDevice.last_seen 
                        ? new Date(selectedDevice.last_seen).toLocaleString('id-ID')
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Last Poll</Label>
                    <p className="text-sm">
                      {selectedDevice.last_poll 
                        ? new Date(selectedDevice.last_poll).toLocaleString('id-ID')
                        : 'Never'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Created At</Label>
                    <p className="text-sm">
                      {selectedDevice.created_at 
                        ? new Date(selectedDevice.created_at).toLocaleString('id-ID')
                        : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Updated At</Label>
                    <p className="text-sm">
                      {selectedDevice.updated_at 
                        ? new Date(selectedDevice.updated_at).toLocaleString('id-ID')
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-t pt-4 flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setViewDialogOpen(false);
                    handleEditDevice(selectedDevice);
                  }}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Device
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => {
                    setViewDialogOpen(false);
                    handleDeleteClick(selectedDevice);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Device Dialog - Simplified */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit CCTV Device</DialogTitle>
            <DialogDescription>
              Update device connection information
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleUpdateDevice} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Sync Channels & Storage Button */}
                <div className="col-span-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSyncDevice}
                    disabled={syncing}
                    className="w-full bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                  >
                    {syncing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Syncing Channels & Storage...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Channels & Storage from Device
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Fetches the latest channel configuration directly from the device
                  </p>
                </div>

                {/* Device Name */}
              <div className="col-span-2">
                <Label htmlFor="edit-name">Device Name *</Label>
                <Input
                  id="edit-name"
                  placeholder="e.g., DVR Kantor Pusat"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  required
                />
              </div>

              {/* IP Address */}
              <div>
                <Label htmlFor="edit-ipAddress">IP Address *</Label>
                <Input
                  id="edit-ipAddress"
                  placeholder="e.g., 192.168.1.100"
                  value={formData.ipAddress}
                  onChange={(e) => handleInputChange('ipAddress', e.target.value)}
                  required
                />
              </div>

              {/* Port */}
              <div>
                <Label htmlFor="edit-port">Port *</Label>
                <Input
                  id="edit-port"
                  type="number"
                  placeholder="80"
                  value={formData.port}
                  onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
                  required
                />
              </div>

              {/* Username */}
              <div>
                <Label htmlFor="edit-username">Username *</Label>
                <Input
                  id="edit-username"
                  placeholder="admin"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  required
                />
              </div>

              {/* Password */}
              <div>
                <Label htmlFor="edit-password">Password (leave empty to keep current)</Label>
                <Input
                  id="edit-password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                />
              </div>

              {/* Location */}
              <div className="col-span-2">
                <Label htmlFor="edit-location">Location</Label>
                <Select
                  value={formData.locationId}
                  onValueChange={(value) => handleInputChange('locationId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select location (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((location) => (
                      <SelectItem key={location.id} value={location.id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* HTTPS */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="edit-isHttps"
                  checked={formData.isHttps}
                  onChange={(e) => handleInputChange('isHttps', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="edit-isHttps" className="cursor-pointer">
                  Use HTTPS
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Update Device
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Device</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this device? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deviceToDelete && (
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold">{deviceToDelete.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {deviceToDelete.vendor} {deviceToDelete.device_type}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {deviceToDelete.ip_address}:{deviceToDelete.port}
                  </p>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Device
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}