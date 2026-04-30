import React, { useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { Device } from '@/types/inventory';

// Fix for default marker icons in Leaflet with Webpack/Vite
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom MarkerCluster component for React Leaflet with Location Deduplication
const MarkerCluster = ({ devices }: { devices: Device[] }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    // Create marker cluster group
    // @ts-ignore
    const mg = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 40
    });

    // GROUP DEVICES BY LOCATION
    const locationGroups = devices.reduce((acc, dev) => {
      // Use location name as key, if no location, use coordinates as fallback
      const key = dev.location || `${dev.latitude},${dev.longitude}`;
      if (!acc[key]) {
        acc[key] = {
          name: dev.location || 'Unknown Location',
          lat: dev.latitude!,
          lon: dev.longitude!,
          devices: []
        };
      }
      acc[key].devices.push(dev);
      return acc;
    }, {} as Record<string, { name: string, lat: number, lon: number, devices: Device[] }>);

    Object.values(locationGroups).forEach(group => {
      const marker = L.marker([group.lat, group.lon]);
      
      // Permanent label shows Location Name + Device Count if > 1
      const labelText = group.devices.length > 1 
        ? `${group.name} (${group.devices.length} units)` 
        : group.name;

      marker.bindTooltip(
        `<div class="font-bold text-[10px]">${labelText}</div>`, 
        { permanent: true, direction: 'top', offset: [0, -35], className: 'device-tooltip' }
      );

      // Popup shows ALL devices at this location
      const devicesHtml = group.devices.map(d => `
        <div class="flex items-center justify-between gap-4 py-1 border-b border-border last:border-0">
          <div class="flex flex-col">
            <span class="font-bold text-[11px] text-primary">${d.hostname}</span>
            <span class="text-[9px] text-foreground-muted">${d.ip}</span>
          </div>
          <span class="text-[8px] font-black uppercase ${d.status === 'online' ? 'text-success' : 'text-danger'}">${d.status}</span>
        </div>
      `).join('');

      marker.bindPopup(`
        <div class="p-1 min-w-[200px]">
          <div class="mb-2 pb-1 border-b-2 border-primary/20">
            <h3 class="font-black text-xs text-foreground uppercase tracking-wider">${group.name}</h3>
            <p class="text-[9px] text-foreground-muted">${group.lat.toFixed(4)}, ${group.lon.toFixed(4)}</p>
          </div>
          <div class="max-h-48 overflow-y-auto pr-1">
            ${devicesHtml}
          </div>
        </div>
      `);

      mg.addLayer(marker);
    });

    map.addLayer(mg);

    // Fit bounds
    const validPoints = Object.values(locationGroups).map(g => L.latLng(g.lat, g.lon));
    if (validPoints.length > 1) {
      const bounds = L.latLngBounds(validPoints);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else if (validPoints.length === 1) {
      map.setView(validPoints[0], 15);
    }

    return () => {
      map.removeLayer(mg);
    };
  }, [devices, map]);

  return null;
};

interface DeviceMapProps {
  devices: Device[];
  center?: [number, number];
  zoom?: number;
  singleDeviceMode?: boolean;
}

const DeviceMap: React.FC<DeviceMapProps> = ({ devices, center, zoom = 13, singleDeviceMode = false }) => {
  const validDevices = devices.filter(d => d.latitude && d.longitude && d.latitude !== 0 && d.longitude !== 0);

  const defaultCenter: [number, number] = center || (validDevices.length > 0 
    ? [validDevices[0].latitude!, validDevices[0].longitude!] 
    : [-8.65, 115.22]);

  return (
    <div className="w-full h-full rounded-lg overflow-hidden border border-border shadow-sm">
      <MapContainer 
        center={defaultCenter} 
        zoom={zoom} 
        scrollWheelZoom={!singleDeviceMode}
        style={{ height: '100%', width: '100%', background: '#1a1a1a' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          className="map-tiles"
        />
        
        <MarkerCluster devices={validDevices} />
        
      </MapContainer>
      
      <style>{`
        .leaflet-container {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
        .device-tooltip {
          background-color: hsl(var(--card)) !important;
          border: 1px solid hsl(var(--border)) !important;
          color: hsl(var(--foreground)) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
          border-radius: 4px !important;
          padding: 2px 8px !important;
          white-space: nowrap;
        }
        .leaflet-popup-content-wrapper {
          background: hsl(var(--card)) !important;
          color: hsl(var(--foreground)) !important;
          border: 1px solid hsl(var(--border)) !important;
          border-radius: 8px !important;
        }
        .leaflet-popup-tip {
          background: hsl(var(--card)) !important;
        }
      `}</style>
    </div>
  );
};

export default DeviceMap;
