import React, { useState, useEffect } from 'react';
import { PageHeader } from '@/components/ui-enterprise';
import { LayoutDashboard, Users, Server, Tag, ShieldAlert, CheckCircle, Wrench, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { assetApi } from '@/lib/api-assets';

export default function AssetDashboardPage() {
  const [stats, setStats] = useState({
    totalAssets: 0,
    amAssetsCount: 0,
    devicesCount: 0,
    cctvCount: 0,
    totalActive: 0
  });

  const fetchStats = async () => {
    try {
      const data = await assetApi.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch dashboard stats', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Asset Dashboard"
        subtitle="Overview of your company's physical and digital assets."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20 relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Managed Assets</CardTitle>
            <Package className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalAssets}</div>
            <p className="text-xs text-muted-foreground mt-1">General: {stats.amAssetsCount}</p>
            <div className="absolute top-2 right-2 flex gap-1 opacity-20">
              <Server className="w-8 h-8" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-green-500/5 border-green-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active & Good</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalActive}</div>
            <p className="text-xs text-muted-foreground mt-1">Assets currently online or active</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Under Repair</CardTitle>
            <Wrench className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">0</div>
            <p className="text-xs text-muted-foreground mt-1">No data</p>
          </CardContent>
        </Card>

        <Card className="bg-red-500/5 border-red-500/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Missing / Lost</CardTitle>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">0</div>
            <p className="text-xs text-muted-foreground mt-1">No data</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Server className="w-4 h-4" /> Assets Source Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'AM_Assets', count: stats.amAssetsCount },
                { name: 'Devices', count: stats.devicesCount },
                { name: 'CCTVDevices', count: stats.cctvCount }
              ].map(item => (
                <div key={item.name}>
                  <div className="flex justify-between items-center mb-1 text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">{item.count}</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${stats.totalAssets > 0 ? (item.count / stats.totalAssets) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" /> Recent Assignments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg">
                Coming soon...
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
