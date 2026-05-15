import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, Plus, Users, ChevronLeft, Volume2, VolumeX, Search, Paperclip, FileText, Download, Image as ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../hooks/useSocket';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────
interface User { id: string; username: string; full_name: string; }
interface Conversation {
  id: string; type: 'direct' | 'group'; name: string | null;
  last_message: string | null; last_message_at: string | null;
  unread_count: number; participants_name: string; participants_ids: string;
}
interface Message {
  id: string; conversation_id: string; sender_id: string;
  username: string; full_name: string; content: string;
  is_read: boolean; created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.35);
  } catch (_) { }
}

function isImageType(mimeOrName?: string | null) {
  if (!mimeOrName) return false;
  return mimeOrName.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff)$/i.test(mimeOrName);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Attachment Preview (in bubble) ──────────────────────────────────
function AttachmentBubble({ url, name, type, isMine }: { url: string; name?: string | null; type?: string | null; isMine: boolean }) {
  if (isImageType(type || name)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img
          src={url} alt={name || 'image'}
          className="max-w-[200px] max-h-[160px] rounded-xl object-cover border border-white/20 hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer" download={name || true}
      className={cn(
        "flex items-center gap-2 mt-1 px-3 py-2 rounded-xl border text-xs font-medium transition-all hover:opacity-80",
        isMine
          ? "bg-white/10 border-white/20 text-white"
          : "bg-surface border-border text-foreground"
      )}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="truncate max-w-[140px]">{name || 'Download file'}</span>
      <Download className="w-3.5 h-3.5 shrink-0 ml-auto" />
    </a>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function ChatWidget() {
  const { user } = useAuth();
  const { emit, on } = useSocket();

  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<'list' | 'chat' | 'newchat'>('list');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [totalUnread, setTotalUnread] = useState(0);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');

  // Attachment state
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedNewUsers, setSelectedNewUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const headers = { 'x-user-id': user?.id || '' };

  // ── Conversations ─────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!user) return;
    const res = await fetch('/api/chat/conversations', { headers });
    const data = await res.json();
    setConversations(data || []);
    const unread = (data || []).reduce((a: number, c: Conversation) => a + (c.unread_count || 0), 0);
    setTotalUnread(unread);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (isOpen) return;
    const interval = setInterval(async () => {
      if (!user) return;
      const res = await fetch('/api/chat/unread', { headers });
      const data = await res.json();
      setTotalUnread(data.count || 0);
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, user]);

  // ── Socket listeners ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const offMsg = on('new_message', (msg: unknown) => {
      const m = msg as Message;
      if (activeConvo && m.conversation_id === activeConvo.id) {
        setMessages(prev => [...prev, m]);
      }
      loadConversations();
    });
    const offNotif = on('new_notification', (_notif: unknown) => {
      if (soundEnabled) playNotifSound();
      loadConversations();
    });
    return () => { offMsg?.(); offNotif?.(); };
  }, [user, activeConvo, soundEnabled, on, loadConversations]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Open conversation ─────────────────────────────────────────────
  const openConversation = async (convo: Conversation) => {
    setActiveConvo(convo); setView('chat');
    emit('join_room', convo.id);
    const res = await fetch(`/api/chat/conversations/${convo.id}/messages`, { headers });
    const data = await res.json();
    setMessages(data || []);
    loadConversations();
  };

  // ── File selection ─────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('Max file size is 10 MB'); return; }
    setAttachFile(file);
    if (isImageType(file.type)) {
      const reader = new FileReader();
      reader.onload = ev => setAttachPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachPreview(null);
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const clearAttach = () => { setAttachFile(null); setAttachPreview(null); };

  // ── Send message ──────────────────────────────────────────────────
  const sendMessage = async () => {
    const content = inputText.trim();
    if ((!content && !attachFile) || !activeConvo || !user) return;

    let attachmentUrl: string | undefined;
    let attachmentName: string | undefined;
    let attachmentType: string | undefined;

    // Upload file first if any
    if (attachFile) {
      setIsUploading(true);
      try {
        const form = new FormData();
        form.append('file', attachFile);
        const res = await fetch('/api/chat/upload', { method: 'POST', headers, body: form });
        if (!res.ok) { toast.error('Upload failed'); setIsUploading(false); return; }
        const data = await res.json();
        attachmentUrl = data.url;
        attachmentName = data.name;
        attachmentType = data.type;
      } catch {
        toast.error('Upload error');
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    }

    emit('send_message', {
      conversationId: activeConvo.id,
      senderId: user.id,
      content,
      attachmentUrl,
      attachmentName,
      attachmentType,
    });

    setInputText('');
    clearAttach();
  };

  // ── Create new conversation ───────────────────────────────────────
  const loadAllUsers = async () => {
    const res = await fetch('/api/chat/users', { headers });
    const data = await res.json();
    setAllUsers((data || []).filter((u: User) => u.id !== user?.id));
  };

  const startNewChat = async () => {
    if (selectedNewUsers.length === 0 || !user) return;
    const targetUserIds = selectedNewUsers.map(u => u.id);
    const isGroup = targetUserIds.length > 1;
    const res = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserIds, groupName: isGroup ? groupName || 'Group Chat' : undefined })
    });
    const data = await res.json();
    await loadConversations();
    const convo = {
      id: data.id, type: isGroup ? 'group' : 'direct',
      name: groupName || null, last_message: null, last_message_at: null, unread_count: 0,
      participants_name: selectedNewUsers.map(u => u.full_name).join(', '),
      participants_ids: selectedNewUsers.map(u => u.id).join(',')
    } as Conversation;
    openConversation(convo);
    setSelectedNewUsers([]); setGroupName(''); setUserSearch('');
  };

  if (!user) return null;

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-20 md:bottom-6 right-20 md:right-[5.5rem] z-[999] flex flex-col items-end gap-3">
      {/* Hidden file input */}
      <input
        ref={fileInputRef} type="file" hidden
        accept=".jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.tiff,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.zip,.rar,.7z,.tar,.gz,.exe,.msi,.rpt,.xml,.json,.log,.sql"
        onChange={handleFileSelect}
      />

      {/* Chat Panel */}
      {isOpen && (
        <div className="w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-zoom-in" style={{ height: '520px' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/20 to-info/10 border-b border-border shrink-0">
            {view === 'chat' ? (
              <button onClick={() => { setView('list'); setActiveConvo(null); clearAttach(); }}
                className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ChevronLeft className="w-4 h-4" />
                <span className="truncate max-w-[150px]">{activeConvo?.participants_name || activeConvo?.name || 'Chat'}</span>
              </button>
            ) : view === 'newchat' ? (
              <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ChevronLeft className="w-4 h-4" /> New Message
              </button>
            ) : (
              <span className="text-sm font-bold text-foreground flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" /> Messages
              </span>
            )}
            <div className="flex items-center gap-1.5">
              {view === 'list' && (
                <button onClick={() => { setView('newchat'); loadAllUsers(); }}
                  className="p-1.5 rounded-lg hover:bg-primary/10 text-foreground-muted hover:text-primary transition-colors" title="New message">
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setSoundEnabled(p => !p)}
                className="p-1.5 rounded-lg hover:bg-primary/10 text-foreground-muted hover:text-primary transition-colors"
                title={soundEnabled ? 'Mute' : 'Unmute'}>
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-danger/10 text-foreground-muted hover:text-danger transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Conversation List */}
          {view === 'list' && (
            <div className="flex-1 overflow-y-auto divide-y divide-border/50">
              {conversations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-3 text-foreground-muted p-6">
                  <MessageCircle className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium text-center">No conversations yet.<br />Start a new message!</p>
                </div>
              ) : (
                conversations.map(convo => (
                  <button key={convo.id} onClick={() => openConversation(convo)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface/60 transition-colors text-left">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                      {convo.type === 'group' ? <Users className="w-5 h-5" /> : (convo.participants_name?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={cn("text-sm font-semibold truncate", convo.unread_count > 0 ? "text-foreground" : "text-foreground-muted")}>
                          {convo.name || convo.participants_name || 'Chat'}
                        </span>
                        <span className="text-[10px] text-foreground-muted shrink-0 ml-2">
                          {convo.last_message_at ? format(new Date(convo.last_message_at), 'HH:mm') : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[11px] text-foreground-muted truncate">{convo.last_message || 'No messages yet'}</span>
                        {convo.unread_count > 0 && (
                          <span className="ml-2 bg-primary text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center shrink-0">
                            {convo.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* New Chat / Group */}
          {view === 'newchat' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
                  <input type="text" placeholder="Search users..." value={userSearch} onChange={e => setUserSearch(e.target.value)}
                    className="w-full bg-surface border border-border rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-primary" />
                </div>
                {selectedNewUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedNewUsers.map(u => (
                      <span key={u.id} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1 font-medium">
                        {u.full_name}
                        <button onClick={() => setSelectedNewUsers(prev => prev.filter(x => x.id !== u.id))}><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                {selectedNewUsers.length > 1 && (
                  <input type="text" placeholder="Group name (optional)" value={groupName} onChange={e => setGroupName(e.target.value)}
                    className="w-full mt-2 bg-surface border border-border rounded-xl py-2 px-3 text-xs focus:outline-none focus:border-primary" />
                )}
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-border/50">
                {allUsers.filter(u => u.full_name.toLowerCase().includes(userSearch.toLowerCase())).map(u => (
                  <button key={u.id}
                    onClick={() => setSelectedNewUsers(prev => prev.find(x => x.id === u.id) ? prev.filter(x => x.id !== u.id) : [...prev, u])}
                    className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-surface/60 transition-colors text-left",
                      selectedNewUsers.find(x => x.id === u.id) ? "bg-primary/10" : "")}>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {(u.full_name?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{u.full_name}</p>
                      <p className="text-[10px] text-foreground-muted">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-border">
                <button onClick={startNewChat} disabled={selectedNewUsers.length === 0}
                  className="w-full py-2 bg-primary text-white rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-primary/90 transition-all">
                  {selectedNewUsers.length > 1 ? 'Create Group' : 'Start Chat'}
                </button>
              </div>
            </div>
          )}

          {/* Chat View */}
          {view === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.map((msg, i) => {
                  const isMine = msg.sender_id === user.id;
                  const showName = !isMine && (i === 0 || messages[i - 1].sender_id !== msg.sender_id);
                  const hasContent = msg.content?.trim();
                  const hasAttach = msg.attachment_url;
                  return (
                    <div key={msg.id} className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                      {showName && <span className="text-[9px] text-foreground-muted font-medium mb-0.5 ml-2">{msg.full_name}</span>}
                      <div className={cn(
                        "max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-sm",
                        isMine ? "bg-primary text-white rounded-br-sm" : "bg-surface-raised text-foreground rounded-bl-sm border border-border"
                      )}>
                        {hasContent && <p>{msg.content}</p>}
                        {hasAttach && (
                          <AttachmentBubble
                            url={msg.attachment_url!}
                            name={msg.attachment_name}
                            type={msg.attachment_type}
                            isMine={isMine}
                          />
                        )}
                      </div>
                      <span className="text-[9px] text-foreground-muted mt-0.5 mx-2">{format(new Date(msg.created_at), 'HH:mm')}</span>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Attachment preview strip */}
              {attachFile && (
                <div className="px-3 pb-1 shrink-0">
                  <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
                    {attachPreview
                      ? <img src={attachPreview} alt="preview" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-primary/30" />
                      : <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-primary" /></div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{attachFile.name}</p>
                      <p className="text-[10px] text-foreground-muted">{formatFileSize(attachFile.size)}</p>
                    </div>
                    <button onClick={clearAttach} className="p-1 hover:bg-danger/10 rounded-lg text-foreground-muted hover:text-danger transition-colors shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-border shrink-0">
                <div className="flex items-center gap-2 bg-surface-raised rounded-xl border border-border px-2 py-1.5 focus-within:border-primary transition-colors">
                  {/* Attach button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-7 h-7 flex items-center justify-center text-foreground-muted hover:text-primary transition-colors shrink-0"
                    title="Attach file"
                  >
                    {attachFile
                      ? <ImageIcon className="w-4 h-4 text-primary" />
                      : <Paperclip className="w-4 h-4" />
                    }
                  </button>

                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder={attachFile ? "Add a caption..." : "Type a message..."}
                    className="flex-1 bg-transparent text-xs outline-none text-foreground placeholder:text-foreground-muted"
                  />

                  <button
                    onClick={sendMessage}
                    disabled={(!inputText.trim() && !attachFile) || isUploading}
                    className="w-7 h-7 bg-primary rounded-full flex items-center justify-center disabled:opacity-30 hover:bg-primary/90 transition-all shrink-0"
                  >
                    {isUploading
                      ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Send className="w-3.5 h-3.5 text-white" />
                    }
                  </button>
                </div>
                <p className="text-[9px] text-foreground-muted mt-1 text-center opacity-60">
                  Max 10MB · Images, Docs, EXE, RPT, Archives
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Toggle Button */}
      <button
        onClick={() => { setIsOpen(p => !p); if (!isOpen) loadConversations(); }}
        className={cn(
          "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative",
          "bg-gradient-to-br from-primary to-info text-white"
        )}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {!isOpen && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-pulse">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
