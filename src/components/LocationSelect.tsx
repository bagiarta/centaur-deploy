import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronsUpDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Location {
  location_code: string;
  location_name: string;
}

interface LocationSelectProps {
  value: string;
  onChange: (value: string) => void;
  locations: Location[];
  placeholder?: string;
  required?: boolean;
}

export function LocationSelect({ value, onChange, locations, placeholder = "-- Choose Location --", required = false }: LocationSelectProps) {
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

  const filtered = locations.filter(l => 
    l.location_name.toLowerCase().includes(search.toLowerCase()) || 
    l.location_code.toLowerCase().includes(search.toLowerCase())
  );

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
          ? locations.find(l => l.location_code === value)?.location_name || value
          : placeholder}
        <ChevronsUpDown className="w-4 h-4 ml-2 opacity-50 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-md shadow-md z-50 p-1 flex flex-col max-h-[250px]">
          <div className="flex items-center border-b px-2 pb-1 sticky top-0 bg-popover">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input 
              className="flex h-9 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto pt-1 flex-1">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No location found.</div>
            ) : (
              filtered.map((loc) => (
                <div
                  key={loc.location_code}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    value === loc.location_code && "bg-accent/50 font-medium"
                  )}
                  onClick={() => {
                    onChange(loc.location_code);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === loc.location_code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {loc.location_name} <span className="text-xs text-muted-foreground ml-2">({loc.location_code})</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
