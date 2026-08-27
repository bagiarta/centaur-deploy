import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Asset {
  asset_code: string;
  asset_name: string;
  serial_number?: string;
  activa_code?: string;
  physical_address?: string;
}

interface AssetSelectProps {
  value: string;
  onChange: (value: string) => void;
  assets: Asset[];
  placeholder?: string;
  required?: boolean;
}

export function AssetSelect({ value, onChange, assets, placeholder = "-- Choose Asset --", required = false }: AssetSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = assets.filter(a => {
    const s = search.toLowerCase();
    return (
      (a.asset_name?.toLowerCase() || '').includes(s) || 
      (a.asset_code?.toLowerCase() || '').includes(s) ||
      (a.serial_number?.toLowerCase() || '').includes(s) ||
      (a.activa_code?.toLowerCase() || '').includes(s) ||
      (a.physical_address?.toLowerCase() || '').includes(s)
    );
  });

  return (
    <div className="relative w-full" ref={ref}>
      {required && (
        <input 
          type="text" 
          required={required} 
          value={value} 
          onChange={() => {}} 
          className="absolute opacity-0 w-0 h-0 p-0 m-0 border-0" 
          tabIndex={-1} 
        />
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between p-2 border rounded-md bg-background text-sm outline-none focus:ring-2 focus:ring-primary",
          !value && "text-muted-foreground"
        )}
      >
        {value
          ? `${assets.find(a => a.asset_code === value)?.asset_name || value} (${value})`
          : placeholder}
        <ChevronsUpDown className="w-4 h-4 ml-2 opacity-50 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-md z-50 p-1 flex flex-col max-h-[250px]">
          <div className="flex items-center border-b px-2 pb-1 sticky top-0 bg-popover">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input 
              className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search asset..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto pt-1 flex-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No asset found.</div>
            ) : (
              filtered.map((ast) => (
                <div
                  key={ast.asset_code}
                  className={cn(
                    "relative flex cursor-pointer select-none items-start rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    value === ast.asset_code && "bg-accent/50 font-medium"
                  )}
                  onClick={() => {
                    onChange(ast.asset_code);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 mt-0.5 shrink-0",
                      value === ast.asset_code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col w-full min-w-0">
                    <div className="flex items-baseline flex-wrap gap-x-2">
                      <span className="font-medium">{ast.asset_name}</span> 
                      <span className="text-xs text-muted-foreground whitespace-nowrap">({ast.asset_code})</span>
                    </div>
                    {(ast.serial_number || ast.activa_code || ast.physical_address) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground mt-0.5">
                        {ast.serial_number && <span>SN: <span className="font-medium text-foreground/70">{ast.serial_number}</span></span>}
                        {ast.activa_code && <span>Aktiva: <span className="font-medium text-foreground/70">{ast.activa_code}</span></span>}
                        {ast.physical_address && <span>Lokasi: <span className="font-medium text-foreground/70">{ast.physical_address}</span></span>}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
