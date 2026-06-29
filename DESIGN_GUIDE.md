# Design Guide - CCTV Monitoring Style

Panduan desain ini berdasarkan CCTV Monitoring Page yang sudah dibuat dengan tampilan modern dan menarik.

## 🎨 Color Palette & Gradients

### Background
```tsx
className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
```

### Container
```tsx
<div className="container mx-auto p-6 space-y-6">
```

### Header dengan Gradient
```tsx
<div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 p-8 shadow-2xl">
  <div className="absolute inset-0 bg-black/10"></div>
  <div className="relative z-10 flex justify-between items-center text-white">
    {/* Content */}
  </div>
</div>
```

**Variasi Gradient untuk Header:**
- **Blue-Purple-Pink**: `from-blue-600 via-purple-600 to-pink-600` (CCTV)
- **Indigo-Blue-Cyan**: `from-indigo-600 via-blue-600 to-cyan-600` (Logs)
- **Purple-Pink-Rose**: `from-purple-600 via-pink-600 to-rose-600` (Devices)
- **Emerald-Teal-Cyan**: `from-emerald-600 via-teal-600 to-cyan-600` (Groups)

## 📊 Statistics Cards

### Card dengan Gradient Background
```tsx
<Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative">
  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16"></div>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 relative z-10">
    <CardTitle className="text-sm font-medium text-blue-100">Title</CardTitle>
    <div className="p-2 bg-white/20 rounded-lg">
      <Icon className="h-5 w-5" />
    </div>
  </CardHeader>
  <CardContent className="relative z-10">
    <div className="text-4xl font-bold">123</div>
    <div className="flex gap-3 mt-3 text-sm">
      <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-md">
        <Icon className="w-3 h-3" />
        <span className="font-medium">Detail</span>
      </div>
    </div>
  </CardContent>
</Card>
```

**Color Schemes untuk Cards:**
- **Blue**: `from-blue-500 to-blue-600` + `text-blue-100`
- **Purple**: `from-purple-500 to-purple-600` + `text-purple-100`
- **Emerald**: `from-emerald-500 to-emerald-600` + `text-emerald-100`
- **Orange-Red**: `from-orange-500 to-red-600` + `text-orange-100`
- **Indigo**: `from-indigo-500 to-indigo-600` + `text-indigo-100`
- **Cyan**: `from-cyan-500 to-cyan-600` + `text-cyan-100`

## 🔘 Buttons

### Primary Button (Header)
```tsx
<Button 
  className="bg-white text-blue-600 hover:bg-blue-50 shadow-lg font-semibold"
>
  <Icon className="w-5 h-5 mr-2" />
  Action
</Button>
```

### Secondary Button (Header)
```tsx
<Button 
  variant="secondary"
  className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white border-white/30 shadow-lg"
>
  <Icon className="w-5 h-5 mr-2" />
  Action
</Button>
```

## 📋 Content Cards

### Card dengan Backdrop Blur
```tsx
<Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
  <CardContent className="p-6">
    {/* Content */}
  </CardContent>
</Card>
```

### Device/Item Card dengan Status Bar
```tsx
<Card className="border-0 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden bg-gradient-to-br from-emerald-50 to-blue-50 hover:from-emerald-100 hover:to-blue-100">
  {/* Status Bar */}
  <div className="h-2 bg-gradient-to-r from-emerald-400 to-green-500"></div>
  
  <CardHeader>
    {/* Content */}
  </CardHeader>
  
  <CardContent className="space-y-3">
    {/* Info boxes */}
    <div className="flex items-center gap-2 p-3 bg-white/60 backdrop-blur-sm rounded-lg">
      <Icon className="w-4 h-4 text-blue-500" />
      <span className="text-sm font-medium text-gray-700">Info</span>
    </div>
  </CardContent>
</Card>
```

## 🎯 Status Colors

### Status Bar Colors
- **Online/Success**: `bg-gradient-to-r from-emerald-400 to-green-500`
- **Offline**: `bg-gradient-to-r from-gray-400 to-slate-500`
- **Warning**: `bg-gradient-to-r from-orange-400 to-yellow-500`
- **Error**: `bg-gradient-to-r from-red-400 to-red-600`

### Badge Colors
- **Online**: `bg-emerald-500 hover:bg-emerald-600 text-white shadow-md`
- **Offline**: `bg-gray-300 text-gray-700`
- **Warning**: `bg-orange-500 text-white`
- **Error**: `bg-red-500 text-white`

## 📱 Responsive Design

### Spacing
- Container padding: `p-6`
- Space between sections: `space-y-6`
- Card padding: `p-6` atau `p-4` untuk smaller cards
- Grid gaps: `gap-6` untuk cards, `gap-4` untuk smaller items

### Grid Layouts
```tsx
{/* Stats Cards */}
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">

{/* Device/Item Cards */}
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
```

## 🎨 Icon Styling

### Header Icons
```tsx
<div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
  <Icon className="w-8 h-8" />
</div>
```

### Card Icons (Small)
```tsx
<Icon className="w-4 h-4 text-blue-500" />
```

### Card Icons (Medium)
```tsx
<div className="p-2 bg-white/20 rounded-lg">
  <Icon className="h-5 w-5" />
</div>
```

## ✨ Effects & Transitions

### Shadow Effects
- Cards: `shadow-xl`
- Hover: `hover:shadow-2xl`
- Header: `shadow-2xl`

### Transitions
- All transitions: `transition-all duration-300`
- Hover effects: `hover:from-emerald-100 hover:to-blue-100`

### Backdrop Blur
- Buttons: `backdrop-blur-sm`
- Cards: `backdrop-blur-sm`
- Info boxes: `backdrop-blur-sm`

## 🔄 Loading States
```tsx
if (loading) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center">
      <Icon className="w-8 h-8 text-primary animate-pulse" />
    </div>
  );
}
```

## 📝 Implementation Checklist

Untuk menerapkan design ini ke page lain:

1. ✅ Update main container dengan gradient background
2. ✅ Ganti header dengan gradient style
3. ✅ Update statistics cards dengan gradient colors
4. ✅ Tambahkan shadow-xl dan backdrop-blur effects
5. ✅ Update button styling (primary & secondary)
6. ✅ Sesuaikan spacing (p-6, space-y-6, gap-6)
7. ✅ Tambahkan hover effects dan transitions
8. ✅ Update loading state styling

## 🎯 Color Mapping per Page

| Page | Header Gradient | Primary Card | Secondary Card | Accent Card |
|------|----------------|--------------|----------------|-------------|
| CCTV | blue-purple-pink | blue | purple | emerald/orange-red |
| Logs | indigo-blue-cyan | blue | emerald | red/orange |
| Devices | purple-pink-rose | purple | blue | emerald/orange |
| Groups | emerald-teal-cyan | emerald | cyan | blue/purple |
| Dashboard | blue-indigo-purple | blue | indigo | purple/emerald |

