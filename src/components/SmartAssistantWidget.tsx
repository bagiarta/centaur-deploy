import { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { Bot, X, Send, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import pepiLogo from '@/assets/pepi-logo.png';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: AssistantSource[];
  form?: {
    keywordId: string;
    keyword: string;
    description: string;
    parameter_keys: string[];
    requires_confirmation: boolean;
    target_host: string;
  } | null;
}

interface AssistantSource {
  type: string;
  label: string;
  detail?: string;
}

export function SmartAssistantWidget() {
  const { user, hasPermission } = useAuth();
  const userKey = user?.id || user?.username;
  const dragControls = useDragControls();
  const constraintsRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);

  // Initialize welcome message with user name
  useEffect(() => {
    if (user?.username) {
      setMessages([
        { id: 'welcome', role: 'assistant', text: `Hello **${user.username}**! I am Pepi Assistant. How can I help you today?` }
      ]);
    } else {
      setMessages([
        { id: 'welcome', role: 'assistant', text: 'Hello! I am Pepi Assistant. How can I help you today?' }
      ]);
    }
  }, [user?.username]);

  const [isLoading, setIsLoading] = useState(false);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Listen for external toggle event (e.g. from Sidebar)
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener('toggle-smart-assistant', handleToggle);
    return () => window.removeEventListener('toggle-smart-assistant', handleToggle);
  }, []);

  // Accessibility Check based on Permissions
  if (!hasPermission("assistant")) return null;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    if (!userKey) {
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'assistant', text: '**Error:** Session user tidak ditemukan. Silakan login ulang.' }
      ]);
      return;
    }

    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input };
    const history = messages.filter(m => m.id !== 'welcome');

    console.log('[DEBUG] Assistant Sending Request. User:', user);

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userKey
        },
        body: JSON.stringify({ userId: userKey, history, prompt: userMsg.text })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch response.');
      }

      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          text: data.text,
          sources: Array.isArray(data.sources) ? data.sources : [],
          form: data.form || null
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: `**Error:** ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSuccess = (msgId: string, resultText: string, sources: any[]) => {
    setMessages(prev => prev.map(m => {
      if (m.id === msgId) {
        return {
          ...m,
          text: resultText,
          sources: sources,
          form: null
        };
      }
      return m;
    }));
  };

  if (!isOpen) return null;

  return (
    <motion.div 
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      className="fixed bottom-20 md:bottom-6 left-4 md:left-[260px] z-[9999] flex flex-col items-start pointer-events-auto"
    >

      {isOpen && (
        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col mb-4 transition-all duration-300 ease-in-out",
          isExpanded ? "w-[80vw] h-[80vh] fixed bottom-1/2 right-1/2 translate-x-1/2 translate-y-1/2" : "w-[350px] h-[500px]"
        )}>
          {/* Header */}
          <div 
            className="bg-blue-600 px-4 py-3 flex items-center justify-between text-white shadow-sm cursor-move select-none"
            onPointerDown={(e) => dragControls.start(e)}
            style={{ touchAction: 'none' }}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              <img
                src={pepiLogo}
                alt="Pepi"
                draggable={false}
                className="w-7 h-7 object-contain pointer-events-none"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.querySelector('.fallback-bot')?.classList.remove('hidden');
                }}
              />
              <Bot size={20} className="fallback-bot hidden" />
              <h3 className="font-semibold text-sm tracking-wide">Pepito Monitoring Assistant</h3>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-1 hover:bg-white/20 rounded transition-colors">
                {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-zinc-50 dark:bg-zinc-950/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex w-full",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div className={cn(
                  "max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words",
                  msg.role === 'user'
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-bl-sm shadow-sm"
                )}>
                  {msg.role === 'user' ? (
                    msg.text
                  ) : (
                    <div className="space-y-3">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.form ? "Silakan lengkapi form di bawah untuk melanjutkan" : msg.text}
                        </ReactMarkdown>
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {msg.sources.map((source, index) => (
                            <div
                              key={`${msg.id}-${source.type}-${index}`}
                              className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200"
                              title={source.detail || source.label}
                            >
                              {source.label}
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.form && (
                        <AssistantKeywordForm
                          msgId={msg.id}
                          formInfo={msg.form}
                          userKey={userKey || ""}
                          onSuccess={(resultText, sources) => handleFormSuccess(msg.id, resultText, sources)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start w-full">
                <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-bl-sm px-4 py-3 text-zinc-500 shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800/50 rounded-full px-4 py-2 border border-transparent focus-within:border-blue-500 focus-within:bg-white dark:focus-within:bg-zinc-800 transition-colors">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask something tentang devices..."
                className="flex-1 bg-transparent text-black dark:text-white font-bold outline-none placeholder:text-zinc-600"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 transition-colors"
                title="Send Message"
              >
                <Send size={14} className="ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function AssistantKeywordForm({ 
  msgId,
  formInfo, 
  userKey,
  onSuccess 
}: { 
  msgId: string;
  formInfo: {
    keywordId: string;
    keyword: string;
    description: string;
    parameter_keys: string[];
    requires_confirmation: boolean;
    target_host: string;
  };
  userKey: string;
  onSuccess: (resultText: string, sources: any[]) => void;
}) {
  const [params, setParams] = useState<Record<string, string>>({});
  const [targetHost, setTargetHost] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devicesList, setDevicesList] = useState<any[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);

  useEffect(() => {
    if (!formInfo.target_host) {
      setDevicesLoading(true);
      fetch('/api/devices')
        .then(res => res.json())
        .then(data => {
          const filtered = (data || []).filter((dev: any) => {
            const groupIds = Array.isArray(dev.group_ids)
              ? dev.group_ids
              : (dev.group_ids || '').split(',').map((s: string) => s.trim());
            return groupIds.includes('g2') || groupIds.includes('g3') || dev.status === 'offline';
          });
          setDevicesList(filtered);
        })
        .catch(err => console.error(err))
        .finally(() => setDevicesLoading(false));
    }
  }, [formInfo.target_host]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const missing = formInfo.parameter_keys.filter(key => !params[key]?.trim());
    if (missing.length > 0) {
      toast.error(`Please fill in all parameters: ${missing.join(", ")}`);
      return;
    }

    if (!formInfo.target_host && !targetHost) {
      toast.error("Please select a target host.");
      return;
    }

    if (formInfo.requires_confirmation && !confirm) {
      toast.error("Please check the confirmation box.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/assistant-keywords/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': userKey
        },
        body: JSON.stringify({
          keywordId: formInfo.keywordId,
          parameters: params,
          targetHost: targetHost || undefined,
          confirm
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Execution failed.");
      }

      onSuccess(data.text || "Execution finished successfully.", data.sources || []);
    } catch (err: any) {
      toast.error(err.message);
      onSuccess(`**Error:** ${err.message}`, []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5 text-left text-zinc-800 dark:text-zinc-200 pointer-events-auto">
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Execute Keyword Action</p>
      
      {!formInfo.target_host && (
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Target Host</label>
          {devicesLoading ? (
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Loading devices...</span>
            </div>
          ) : (
            <select
              value={targetHost}
              onChange={(e) => setTargetHost(e.target.value)}
              className="w-full bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-black dark:text-white"
            >
              <option value="">-- Select Host Device --</option>
              {devicesList.map(dev => (
                <option key={dev.id} value={dev.hostname}>{dev.hostname} ({dev.ip})</option>
              ))}
            </select>
          )}
        </div>
      )}

      {formInfo.parameter_keys.length > 0 && (
        <div className="space-y-2">
          {formInfo.parameter_keys.map(key => {
            const isDate = key.toLowerCase().includes("date") || key.toLowerCase().includes("tanggal");
            return (
              <div key={key} className="space-y-1">
                <label className="text-[9px] font-semibold text-zinc-500 block">{key}</label>
                <input
                  type={isDate ? "date" : "text"}
                  placeholder={`Enter ${key}`}
                  value={params[key] || ""}
                  onChange={(e) => setParams({ ...params, [key]: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 text-xs outline-none focus:border-blue-500 text-black dark:text-white"
                />
              </div>
            );
          })}
        </div>
      )}

      {formInfo.requires_confirmation && (
        <label className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg cursor-pointer">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="w-3.5 h-3.5 accent-red-600 rounded cursor-pointer"
          />
          <div className="text-[9px] text-red-600 dark:text-red-400 font-bold select-none">
            I confirm to execute this action
          </div>
        </label>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send size={11} />}
        Run Action
      </button>
    </form>
  );
}
