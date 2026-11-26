import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  MessageSquare,
  User,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Filter,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';

interface ClientItem {
  id: string;
  fullName: string;
  whatsappNumber: string;
  email?: string | null;
  categoryTier: 'RETAIL' | 'HNI' | 'CORPORATE' | 'PROSPECT';
  communicationConsent: 'OPTED_IN' | 'OPTED_OUT' | 'PENDING';
}

interface ClientMessageItem {
  id: string;
  type: 'custom' | 'campaign';
  direction: 'outbound' | 'inbound';
  body: string;
  status: string;
  wamid?: string;
  errorMessage?: string;
  campaignType?: string;
  timestamp: string;
}

const QUICK_REPLIES = [
  {
    label: 'Advisory Callback',
    text: 'Hello {{name}}, thank you for reaching out to Wealth Transformers India Pvt Ltd. Our relationship manager will connect with you shortly regarding your portfolio inquiry.',
  },
  {
    label: 'Portfolio Review',
    text: 'Dear {{name}}, your quarterly wealth portfolio review is ready. Would you like to schedule a 15-minute consultation this week?',
  },
  {
    label: 'KYC Update',
    text: 'Dear {{name}}, as per SEBI guidelines, please ensure your KYC details are up to date for uninterrupted advisory services. Reply if you need assistance.',
  },
  {
    label: 'Thank You',
    text: 'Thank you for your confirmation, {{name}}. We appreciate your continued trust in Wealth Transformers India Pvt Ltd.',
  },
];

export const CustomMessagesPage: React.FC = () => {
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [consentFilter, setConsentFilter] = useState<string>('ALL');

  const [selectedClient, setSelectedClient] = useState<ClientItem | null>(null);
  const [messages, setMessages] = useState<ClientMessageItem[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const fetchClients = async () => {
    setLoadingClients(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (categoryFilter !== 'ALL') params.set('categoryTier', categoryFilter);
      if (consentFilter !== 'ALL') params.set('communicationConsent', consentFilter);

      const res = await apiClient.get<{ data: ClientItem[] }>(`/clients?${params.toString()}`);
      const valid = (res.data?.data || []).filter((c) => !c.fullName.startsWith('ERASED_'));
      setClients(valid);
    } catch (err: any) {
      toast.error('Failed to load clients', err.message || 'Could not retrieve client directory');
    } finally {
      setLoadingClients(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, categoryFilter, consentFilter]);

  const fetchClientMessages = async (clientId: string) => {
    setLoadingMessages(true);
    try {
      const res = await apiClient.get<{ messages: ClientMessageItem[] }>(`/clients/${clientId}/messages`);
      setMessages(res.data?.messages || []);
    } catch (err: any) {
      toast.error('Failed to load messages', err.message || 'Could not fetch conversation history');
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (selectedClient) {
      fetchClientMessages(selectedClient.id);
    } else {
      setMessages([]);
    }
  }, [selectedClient?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedClient) return;
    const trimmed = messageText.trim();
    if (!trimmed) {
      toast.error('Empty message', 'Please enter a message before sending.');
      return;
    }

    setSending(true);
    try {
      const res = await apiClient.post<{
        success: boolean;
        wamid?: string;
        errorMessage?: string;
        item: ClientMessageItem;
      }>(`/clients/${selectedClient.id}/message`, {
        message: trimmed,
      });

      const payload = res.data;
      if (payload?.item) {
        setMessages((prev) => [...prev, payload.item]);
      }

      if (payload?.success) {
        setMessageText('');
        toast.success('Message Dispatched', `Custom message sent to ${selectedClient.fullName}`);
      } else {
        toast.error(
          'Dispatch Warning',
          payload?.errorMessage || 'Message logged, but WhatsApp gateway returned an error.'
        );
      }
    } catch (err: any) {
      toast.error('Send Failed', err.message || 'Could not dispatch message to client');
    } finally {
      setSending(false);
    }
  };

  const applyQuickReply = (template: string) => {
    if (!selectedClient) return;
    const firstName = selectedClient.fullName.split(' ')[0] || selectedClient.fullName;
    setMessageText(template.replace(/\{\{name\}\}/g, firstName));
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const categoryBadgeVariant = (tier: string) => {
    switch (tier) {
      case 'HNI':
        return 'purple';
      case 'CORPORATE':
        return 'info';
      case 'RETAIL':
        return 'success';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-5 h-[calc(100vh-7.5rem)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Custom Client Messaging
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Search or filter clients and send direct personalized WhatsApp replies in real time
          </p>
        </div>
        <button
          onClick={fetchClients}
          disabled={loadingClients}
          className="apple-btn-secondary self-start sm:self-auto"
          title="Refresh Client Directory"
        >
          <RefreshCw className={`w-4 h-4 ${loadingClients ? 'animate-spin' : ''}`} />
          Refresh Directory
        </button>
      </div>

      {/* Main Split View */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Pane: Client Search & Filter */}
        <div className="lg:col-span-4 xl:col-span-4 bg-white/75 dark:bg-[#181A20]/75 backdrop-blur-2xl rounded-[22px] border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden">
          {/* Search & Filters Header */}
          <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.06] space-y-3 flex-shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, phone, or email..."
                className="w-full pl-10 pr-4 py-2 text-xs bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/40 transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-[11px] font-medium bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-apple-blue/40"
                >
                  <option value="ALL">All Categories</option>
                  <option value="HNI">HNI</option>
                  <option value="RETAIL">Retail</option>
                  <option value="CORPORATE">Corporate</option>
                  <option value="PROSPECT">Prospect</option>
                </select>
              </div>
              <div className="relative">
                <select
                  value={consentFilter}
                  onChange={(e) => setConsentFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-[11px] font-medium bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] rounded-xl text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-apple-blue/40"
                >
                  <option value="ALL">All Consent</option>
                  <option value="OPTED_IN">Opted-In</option>
                  <option value="OPTED_OUT">Opted-Out</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
              <span className="flex items-center gap-1">
                <Filter className="w-3 h-3" /> {clients.length} client{clients.length === 1 ? '' : 's'} found
              </span>
            </div>
          </div>

          {/* Client List */}
          <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.05]">
            {loadingClients ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="animate-pulse flex items-center gap-3 p-2">
                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                      <div className="h-2.5 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : clients.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <User className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">No clients match your filter</p>
                <p className="text-[11px] mt-0.5">Try clearing your search or category filter</p>
              </div>
            ) : (
              clients.map((client) => {
                const isSelected = selectedClient?.id === client.id;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedClient(client)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-apple-blue/10 dark:bg-apple-blue/15 border-l-2 border-l-apple-blue'
                        : 'hover:bg-black/[0.02] dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isSelected
                          ? 'bg-apple-blue text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {getInitials(client.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {client.fullName}
                        </p>
                        <Badge variant={categoryBadgeVariant(client.categoryTier) as any}>
                          {client.categoryTier}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                          {client.whatsappNumber}
                        </span>
                        <span
                          className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                            client.communicationConsent === 'OPTED_IN'
                              ? 'bg-emerald-500'
                              : client.communicationConsent === 'OPTED_OUT'
                                ? 'bg-rose-500'
                                : 'bg-amber-400'
                          }`}
                          title={`Consent: ${client.communicationConsent}`}
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Conversation & Composer */}
        <div className="lg:col-span-8 xl:col-span-8 bg-white/75 dark:bg-[#181A20]/75 backdrop-blur-2xl rounded-[22px] border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.04)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden">
          {!selectedClient ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-apple-blue/10 dark:bg-apple-blue/15 flex items-center justify-center mb-4 text-apple-blue dark:text-apple-blue-dark">
                <MessageSquare className="w-8 h-8 stroke-[1.5]" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Select a Client to Message
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1.5 leading-relaxed">
                Search or filter your client directory on the left, select a recipient, and dispatch a personalized WhatsApp message or reply.
              </p>
            </div>
          ) : (
            <>
              {/* Selected Client Header */}
              <div className="px-5 py-3.5 border-b border-black/[0.05] dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-3 flex-shrink-0 bg-black/[0.015] dark:bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-apple-blue text-white flex items-center justify-center text-xs font-bold shadow-sm">
                    {getInitials(selectedClient.fullName)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        {selectedClient.fullName}
                      </h2>
                      <Badge variant={categoryBadgeVariant(selectedClient.categoryTier) as any}>
                        {selectedClient.categoryTier}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3" /> {selectedClient.whatsappNumber}
                      </span>
                      {selectedClient.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {selectedClient.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      selectedClient.communicationConsent === 'OPTED_IN'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                        : selectedClient.communicationConsent === 'OPTED_OUT'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20'
                    }`}
                  >
                    {selectedClient.communicationConsent === 'OPTED_IN' ? (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    {selectedClient.communicationConsent}
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchClientMessages(selectedClient.id)}
                    disabled={loadingMessages}
                    className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    title="Refresh Messages"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Opt-out Notice */}
              {selectedClient.communicationConsent === 'OPTED_OUT' && (
                <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-700 dark:text-rose-300 text-[11px] flex items-center gap-2 flex-shrink-0">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>
                    This client has <strong>OPTED_OUT</strong> of marketing broadcasts. Send direct replies only for active service/compliance inquiries.
                  </span>
                </div>
              )}

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading conversation history...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
                    <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      No message history yet
                    </p>
                    <p className="text-[11px] mt-0.5">
                      Write a custom message below to start communicating with {selectedClient.fullName}.
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[78%] rounded-2xl rounded-tr-sm px-4 py-2.5 bg-apple-blue text-white shadow-sm space-y-1">
                        <div className="flex items-center justify-between gap-4 text-[10px] text-white/75">
                          <span className="font-semibold uppercase tracking-wider">
                            {msg.type === 'custom' ? 'Direct Admin Reply' : msg.campaignType || 'Campaign'}
                          </span>
                          <span className="font-mono">
                            {new Date(msg.timestamp).toLocaleString('en-IN', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        <div className="flex items-center justify-between gap-3 pt-0.5 text-[10px] text-white/75">
                          <span className="flex items-center gap-1">
                            {msg.status === 'FAILED' ? (
                              <>
                                <AlertCircle className="w-3 h-3 text-rose-200" /> Failed
                              </>
                            ) : msg.status === 'QUEUED' ? (
                              <>
                                <Clock className="w-3 h-3" /> Queued
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-200" /> {msg.status}
                              </>
                            )}
                          </span>
                          {msg.wamid && (
                            <span className="font-mono truncate max-w-[140px]" title={msg.wamid}>
                              {msg.wamid.slice(0, 14)}...
                            </span>
                          )}
                        </div>
                        {msg.errorMessage && (
                          <p className="text-[10px] text-rose-200 bg-black/20 rounded px-2 py-1 mt-1">
                            {msg.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies & Composer */}
              <div className="p-4 border-t border-black/[0.05] dark:border-white/[0.06] bg-black/[0.015] dark:bg-white/[0.02] space-y-2.5 flex-shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1 flex-shrink-0 mr-1">
                    <Sparkles className="w-3 h-3 text-apple-blue" /> Quick Replies:
                  </span>
                  {QUICK_REPLIES.map((qr) => (
                    <button
                      key={qr.label}
                      type="button"
                      onClick={() => applyQuickReply(qr.text)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/[0.04] dark:bg-white/[0.07] hover:bg-apple-blue/10 hover:text-apple-blue dark:hover:text-apple-blue-dark text-slate-600 dark:text-slate-300 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSendMessage} className="flex items-end gap-2.5">
                  <div className="flex-1 relative">
                    <textarea
                      rows={2}
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={`Write a custom WhatsApp message to ${selectedClient.fullName}... (Ctrl+Enter to send)`}
                      maxLength={4096}
                      className="w-full px-3.5 py-2.5 text-xs bg-white dark:bg-[#121418] border border-black/[0.08] dark:border-white/[0.1] rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-apple-blue/40 resize-none"
                    />
                    <span className="absolute right-3 bottom-2 text-[10px] text-slate-400 font-mono">
                      {messageText.length}/4096
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="apple-btn-primary h-[54px] px-5 flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Sending...' : 'Send'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
