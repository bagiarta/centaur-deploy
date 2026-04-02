import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import pepiLogo from '@/assets/pepi-logo.png';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: AssistantSource[];
}

interface AssistantSource {
  type: string;
  label: string;
  detail?: string;
}

export function SmartAssistantWidget() {
  const { user, hasPermission } = useAuth();
  const userKey = user?.id || user?.username;
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
          sources: Array.isArray(data.sources) ? data.sources : []
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', text: `**Error:** ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">

      {isOpen && (
        <div className={cn(
          "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-2xl overflow-hidden flex flex-col mb-4 transition-all duration-300 ease-in-out",
          isExpanded ? "w-[80vw] h-[80vh] fixed bottom-1/2 right-1/2 translate-x-1/2 translate-y-1/2" : "w-[350px] h-[500px]"
        )}>
          {/* Header */}
          <div className="bg-blue-600 px-4 py-3 flex items-center justify-between text-white shadow-sm">
            <div className="flex items-center gap-2">
              <img
                src={pepiLogo}
                alt="Pepi"
                className="w-7 h-7 object-contain"
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
                          {msg.text}
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

      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-white hover:bg-zinc-50 shadow-xl flex items-center justify-center transform hover:scale-105 transition-all shadow-blue-500/30 overflow-hidden border-2 border-zinc-100"
        >
          <img
            src={pepiLogo}
            alt="Pepi"
            className="h-full w-full object-contain p-1"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.querySelector('.fallback-bot-btn')?.classList.remove('hidden');
            }}
          />
          <Bot size={28} className="fallback-bot-btn hidden text-blue-600" />
        </button>
      )}

    </div>
  );
}
