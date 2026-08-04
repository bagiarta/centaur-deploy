import React, { useState, useRef, useEffect } from 'react';
import { Type, Tag, QrCode, Trash2, Save, MousePointer2, GripHorizontal, Barcode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ElementType = 'text' | 'price' | 'barcode' | 'qr';

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  bindingField?: string;
}

export interface TemplateDef {
  id?: number;
  name: string;
  width: number;
  height: number;
  elements_json: string;
}

const ESL_SIZES = [
  { label: '1.6" (152 x 152)', width: 152, height: 152 },
  { label: '2.2" (250 x 122)', width: 250, height: 122 },
  { label: '2.6" (296 x 152)', width: 296, height: 152 },
  { label: '2.9" (296 x 128)', width: 296, height: 128 },
  { label: '4.2" (400 x 300)', width: 400, height: 300 },
  { label: '5.8" (648 x 480)', width: 648, height: 480 },
  { label: '7.5" (800 x 480)', width: 800, height: 480 }
];

export function TemplateDesigner() {
  const [templates, setTemplates] = useState<TemplateDef[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState('New Template');
  const [canvasSize, setCanvasSize] = useState(ESL_SIZES[2]); // Default 2.9"
  
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/esl/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.error("Failed to load templates");
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const loadTemplate = (tpl: TemplateDef) => {
    setCurrentTemplateId(tpl.id || null);
    setTemplateName(tpl.name);
    setCanvasSize({ label: 'Custom', width: tpl.width, height: tpl.height });
    try {
      setElements(JSON.parse(tpl.elements_json));
    } catch (e) {
      setElements([]);
    }
    setSelectedId(null);
  };

  const createNewTemplate = () => {
    setCurrentTemplateId(null);
    setTemplateName('New Template');
    setElements([]);
    setSelectedId(null);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    const payload = {
      id: currentTemplateId,
      name: templateName,
      width: canvasSize.width,
      height: canvasSize.height,
      elements_json: JSON.stringify(elements)
    };

    try {
      const res = await fetch('/api/esl/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchTemplates();
      } else {
        toast.error(data.error);
      }
    } catch (e) {
      toast.error('Failed to save template');
    }
  };

  const addElement = (type: ElementType) => {
    const newEl: CanvasElement = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: 20,
      y: 20,
      fontSize: type === 'price' ? 32 : 14,
      fontWeight: type === 'price' ? 'bold' : 'normal',
      text: type === 'text' ? 'Sample Text' : (type === 'price' ? '99.99' : undefined),
      bindingField: type === 'text' ? 'item_name' : (type === 'price' ? 'current_price' : 'itm_cd'),
      width: (type === 'barcode' || type === 'qr') ? 80 : undefined,
      height: (type === 'barcode' || type === 'qr') ? 80 : undefined,
    };
    if (type === 'barcode') {
      newEl.width = 120;
      newEl.height = 40;
    }
    setElements([...elements, newEl]);
    setSelectedId(newEl.id);
  };

  const deleteSelected = () => {
    if (selectedId) {
      setElements(elements.filter(e => e.id !== selectedId));
      setSelectedId(null);
    }
  };

  const updateSelected = (updates: Partial<CanvasElement>) => {
    if (!selectedId) return;
    setElements(elements.map(e => e.id === selectedId ? { ...e, ...updates } : e));
  };

  // Drag logic
  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);
    const el = elements.find(el => el.id === id);
    if (el && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      // Calculate offset inside the element
      const offsetX = e.clientX - rect.left - el.x;
      const offsetY = e.clientY - rect.top - el.y;
      setDragOffset({ x: offsetX, y: offsetY });
      setIsDragging(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !selectedId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    
    // Bounds check
    let newX = e.clientX - rect.left - dragOffset.x;
    let newY = e.clientY - rect.top - dragOffset.y;
    
    // Snap to basic bounds
    if (newX < 0) newX = 0;
    if (newY < 0) newY = 0;
    
    setElements(elements.map(el => 
      el.id === selectedId ? { ...el, x: newX, y: newY } : el
    ));
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const selectedEl = elements.find(e => e.id === selectedId);

  return (
    <div className="flex flex-col md:flex-row h-[600px] bg-background border border-border rounded-xl overflow-hidden">
      {/* Left Sidebar: Tools */}
      <div className="w-full md:w-64 bg-surface border-r border-border p-4 flex flex-col gap-4">
        <div className="mb-6">
          <label className="text-xs font-semibold text-foreground-muted block mb-1">Select Canvas Size</label>
          <select 
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
            value={`${canvasSize.width}x${canvasSize.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              const sz = ESL_SIZES.find(s => s.width === w && s.height === h);
              if (sz) setCanvasSize(sz);
            }}
          >
            {ESL_SIZES.map((sz, i) => (
              <option key={i} value={`${sz.width}x${sz.height}`}>{sz.label}</option>
            ))}
          </select>
        </div>

        <div>
          <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <MousePointer2 className="w-4 h-4" /> Tools
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => addElement('text')}
              className="flex flex-col items-center justify-center p-3 gap-1 bg-background border border-border rounded-xl hover:border-primary hover:text-primary transition-colors text-xs font-semibold text-foreground-muted"
            >
              <Type className="w-5 h-5" /> Text
            </button>
            <button
              onClick={() => addElement('price')}
              className="flex flex-col items-center justify-center p-3 gap-1 bg-background border border-border rounded-xl hover:border-primary hover:text-primary transition-colors text-xs font-semibold text-foreground-muted"
            >
              <Tag className="w-5 h-5" /> Price
            </button>
            <button
              onClick={() => addElement('barcode')}
              className="flex flex-col items-center justify-center p-3 gap-1 bg-background border border-border rounded-xl hover:border-primary hover:text-primary transition-colors text-xs font-semibold text-foreground-muted"
            >
              <Barcode className="w-5 h-5" /> Barcode
            </button>
            <button
              onClick={() => addElement('qr')}
              className="flex flex-col items-center justify-center p-3 gap-1 bg-background border border-border rounded-xl hover:border-primary hover:text-primary transition-colors text-xs font-semibold text-foreground-muted"
            >
              <QrCode className="w-5 h-5" /> QR Code
            </button>
          </div>
        </div>

        <div className="mt-auto">
          <button
            onClick={saveTemplate}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-4 py-2.5 rounded-xl shadow-glow hover:bg-primary/95 transition-all"
          >
            <Save className="w-4 h-4" /> Save Layout
          </button>
        </div>
      </div>

      {/* Center: Canvas Area */}
      <div 
        className="flex-1 bg-black/5 dark:bg-white/5 flex flex-col items-center justify-center relative overflow-hidden"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Canvas container representing ESL screen */}
        <div 
          ref={canvasRef}
          onClick={() => setSelectedId(null)}
          className="relative bg-white shadow-2xl rounded-sm overflow-hidden"
          style={{ width: canvasSize.width, height: canvasSize.height }}
        >
          {elements.map(el => {
            const isSelected = selectedId === el.id;
            return (
              <div
                key={el.id}
                onPointerDown={(e) => handlePointerDown(e, el.id)}
                className={cn(
                  "absolute cursor-move select-none",
                  isSelected ? "outline outline-2 outline-primary outline-offset-1" : "hover:outline hover:outline-1 hover:outline-primary/50"
                )}
                style={{
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                  fontSize: el.fontSize,
                  fontWeight: el.fontWeight,
                  color: '#000', // E-ink screens are mostly black/white/red
                  lineHeight: 1,
                  whiteSpace: 'nowrap'
                }}
              >
                {el.type === 'text' || el.type === 'price' ? (
                  <div className="px-0.5">{el.text}</div>
                ) : el.type === 'barcode' ? (
                  <div className="w-full h-full border-[2px] border-dashed border-black/30 flex items-center justify-center bg-gray-100 flex-col">
                     <Barcode className="w-6 h-6 text-black/50" />
                     <span className="text-[8px] text-black/50 font-mono mt-1">BARCODE</span>
                  </div>
                ) : (
                  <div className="w-full h-full border-[2px] border-dashed border-black/30 flex items-center justify-center bg-gray-100 flex-col">
                     <QrCode className="w-8 h-8 text-black/50" />
                     <span className="text-[8px] text-black/50 font-mono mt-1">QR</span>
                  </div>
                )}
                
                {/* Drag Handle Indicator for selected */}
                {isSelected && (
                  <div className="absolute -top-2 -left-2 w-4 h-4 bg-primary text-white rounded-full flex items-center justify-center cursor-move shadow-md">
                    <GripHorizontal className="w-2.5 h-2.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Sidebar: Properties & Template List */}
      <div className="w-full md:w-72 bg-surface border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground mb-3">Saved Templates</h3>
          <div className="space-y-2 mb-3">
            {templates.length === 0 ? (
              <div className="text-xs text-foreground-muted italic">No templates saved yet.</div>
            ) : templates.map(tpl => (
              <div 
                key={tpl.id} 
                className={cn(
                  "p-2 text-xs border rounded-lg cursor-pointer transition-colors flex justify-between items-center",
                  currentTemplateId === tpl.id ? "bg-primary/10 border-primary text-primary font-bold" : "bg-background border-border hover:border-primary/50 text-foreground"
                )}
                onClick={() => loadTemplate(tpl)}
              >
                <span>{tpl.name}</span>
                <span className="text-[9px] text-foreground-muted opacity-50">{tpl.width}x{tpl.height}</span>
              </div>
            ))}
          </div>
          <button 
            onClick={createNewTemplate}
            className="w-full text-xs font-bold text-primary hover:bg-primary/10 py-1.5 rounded-lg transition-colors border border-dashed border-primary/30"
          >
            + New Template
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          <div className="mb-6 space-y-1.5">
            <label className="text-xs font-semibold text-foreground-muted">Template Name</label>
            <input 
              type="text" 
              value={templateName} 
              onChange={e => setTemplateName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <h3 className="text-sm font-bold text-foreground mb-4 pt-4 border-t border-border">Element Properties</h3>
          
          {!selectedEl ? (
            <div className="text-xs text-foreground-muted text-center py-4">
              Select an element on the canvas to edit its properties.
            </div>
          ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">{selectedEl.type}</span>
              <button
                onClick={deleteSelected}
                className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                title="Delete element"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {(selectedEl.type === 'text' || selectedEl.type === 'price') && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">Display Text</label>
                  <input 
                    type="text" 
                    value={selectedEl.text || ''} 
                    onChange={e => updateSelected({ text: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">Data Binding</label>
                  <select 
                    value={selectedEl.bindingField || ''} 
                    onChange={e => updateSelected({ bindingField: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="none">Static Text (No Binding)</option>
                    <option value="item_name">Item Name</option>
                    <option value="current_price">Price</option>
                    <option value="itm_cd">SKU Code</option>
                    <option value="barcode">Barcode</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground-muted">Font Size</label>
                    <input 
                      type="number" 
                      value={selectedEl.fontSize || 14} 
                      onChange={e => updateSelected({ fontSize: parseInt(e.target.value) || 12 })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground-muted">Weight</label>
                    <select 
                      value={selectedEl.fontWeight || 'normal'} 
                      onChange={e => updateSelected({ fontWeight: e.target.value as 'normal' | 'bold' })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {(selectedEl.type === 'barcode' || selectedEl.type === 'qr') && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground-muted">Data Binding</label>
                  <select 
                    value={selectedEl.bindingField || 'itm_cd'} 
                    onChange={e => updateSelected({ bindingField: e.target.value })}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                  >
                    <option value="itm_cd">SKU Code</option>
                    <option value="barcode">Barcode Field</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground-muted">Width (px)</label>
                    <input 
                      type="number" 
                      value={selectedEl.width || 80} 
                      onChange={e => updateSelected({ width: parseInt(e.target.value) || 80 })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground-muted">Height (px)</label>
                    <input 
                      type="number" 
                      value={selectedEl.height || 80} 
                      onChange={e => updateSelected({ height: parseInt(e.target.value) || 80 })}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="pt-4 border-t border-border grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">X Position</label>
                <div className="bg-surface-raised border border-border rounded text-xs px-2 py-1 font-mono">{Math.round(selectedEl.x)}</div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-foreground-muted uppercase tracking-wider">Y Position</label>
                <div className="bg-surface-raised border border-border rounded text-xs px-2 py-1 font-mono">{Math.round(selectedEl.y)}</div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
