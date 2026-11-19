import React, { useState, useEffect } from 'react';
import {
  Save,
  ShieldCheck,
  Zap,
  Sliders,
  DollarSign,
  Key,
  Database,
  Lock,
  RefreshCw,
} from 'lucide-react';
import { toast } from '../../components/ui/useToast';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../lib/api-client';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pricing' | 'waba' | 'workers' | 'optout'>('pricing');
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings State
  const [settings, setSettings] = useState({
    marketingRate: '0.7854',
    utilityRate: '0.1258',
    authRate: '0.1258',
    gstRate: '18.0',
    wabaId: '109842109871234',
    phoneNumberId: '108472910482910',
    verifyToken: 'wt_webhook_verify_token_2026',
    workerConcurrency: '10',
    messagesPerSecond: '80',
    storageQuotaGb: '10',
    optOutKeywords: 'STOP, UNSUBSCRIBE, OPT OUT, CANCEL, ROKO, BAND KARO, BANDH KARO, THAMBA',
  });

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/settings');
      const list: Array<{ key: string; value: any }> = Array.isArray(res.data) ? res.data : [];

      const newSettings = { ...settings };
      for (const item of list) {
        if (item.key === 'meta_pricing' && Array.isArray(item.value)) {
          const m = item.value.find((c: any) => c.category === 'MARKETING');
          const u = item.value.find((c: any) => c.category === 'UTILITY');
          const a = item.value.find((c: any) => c.category === 'AUTHENTICATION');
          if (m?.rate_inr) newSettings.marketingRate = String(m.rate_inr);
          if (u?.rate_inr) newSettings.utilityRate = String(u.rate_inr);
          if (a?.rate_inr) newSettings.authRate = String(a.rate_inr);
        }
        if (item.key === 'gst_rate') {
          newSettings.gstRate = String(Number(item.value) * 100);
        }
        if (item.key === 'meta_messages_per_second') {
          newSettings.messagesPerSecond = String(item.value);
        }
        if (item.key === 'worker_concurrency') {
          newSettings.workerConcurrency = String(item.value);
        }
        if (item.key === 'opt_out_keywords' && typeof item.value === 'object') {
          const allKeywords = Object.values(item.value).flat().join(', ');
          if (allKeywords) newSettings.optOutKeywords = allKeywords;
        }
        if (item.key === 'waba_id') newSettings.wabaId = String(item.value);
        if (item.key === 'phone_number_id') newSettings.phoneNumberId = String(item.value);
        if (item.key === 'webhook_verify_token') newSettings.verifyToken = String(item.value);
      }
      setSettings(newSettings);
    } catch (err: any) {
      toast.error('Load Error', err.message || 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updates = [
        apiClient.patch('/settings/meta_pricing', {
          value: [
            { category: 'MARKETING', rate_inr: parseFloat(settings.marketingRate) || 0.7854 },
            { category: 'UTILITY', rate_inr: parseFloat(settings.utilityRate) || 0.1258 },
            { category: 'AUTHENTICATION', rate_inr: parseFloat(settings.authRate) || 0.1258 },
          ],
        }),
        apiClient.patch('/settings/gst_rate', {
          value: (parseFloat(settings.gstRate) || 18) / 100,
        }),
        apiClient.patch('/settings/meta_messages_per_second', {
          value: parseInt(settings.messagesPerSecond, 10) || 80,
        }),
        apiClient.patch('/settings/worker_concurrency', {
          value: parseInt(settings.workerConcurrency, 10) || 10,
        }),
        apiClient.patch('/settings/opt_out_keywords', {
          value: {
            all: settings.optOutKeywords.split(',').map((k) => k.trim().toUpperCase()),
          },
        }),
      ];

      await Promise.all(updates);
      toast.success('Configuration Saved', 'Settings hot-reloaded across backend and workers');
    } catch (err: any) {
      toast.error('Save Error', err.response?.data?.message || err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Application Configuration</h1>
          <p className="text-sm text-slate-500 mt-1">
            Meta API credentials, statutory GST pricing, rate limiters and DPDP compliance parameters
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchSettings}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
            title="Refresh Settings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Hot-Reloading...' : 'Save & Hot-Reload'}
          </button>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-medium">
        {[
          { id: 'pricing', label: 'Meta Pricing & GST', icon: DollarSign },
          { id: 'waba', label: 'WABA & Meta Cloud', icon: Key },
          { id: 'workers', label: 'BullMQ & Workers', icon: Zap },
          { id: 'optout', label: 'DPDP Opt-Out Keywords', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      <form onSubmit={handleSave} className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        {/* TAB 1: Pricing */}
        {activeTab === 'pricing' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Statutory Meta Tariffs (India)</h3>
              <p className="text-xs text-slate-500">
                Calibrated against official WhatsApp Cloud API billing schedules with automated GST
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Marketing Conversation Base Rate (INR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">₹</span>
                  <input
                    type="text"
                    value={settings.marketingRate}
                    onChange={(e) => setSettings({ ...settings, marketingRate: e.target.value })}
                    className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Official Meta India Rate: ₹0.7854</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Utility Conversation Base Rate (INR)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">₹</span>
                  <input
                    type="text"
                    value={settings.utilityRate}
                    onChange={(e) => setSettings({ ...settings, utilityRate: e.target.value })}
                    className="w-full pl-8 pr-4 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Official Meta India Rate: ₹0.1258</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Statutory Goods & Services Tax (GST %)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={settings.gstRate}
                    onChange={(e) => setSettings({ ...settings, gstRate: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-bold">%</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Standard Indian GST: 18.0% (Property P8)</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WABA */}
        {activeTab === 'waba' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">Meta WhatsApp Business Account (WABA)</h3>
              <p className="text-xs text-slate-500">
                Credentials retrieved from Meta for Developers portal for WhatsApp Cloud API
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  WABA ID
                </label>
                <input
                  type="text"
                  value={settings.wabaId}
                  onChange={(e) => setSettings({ ...settings, wabaId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Phone Number ID
                </label>
                <input
                  type="text"
                  value={settings.phoneNumberId}
                  onChange={(e) => setSettings({ ...settings, phoneNumberId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Webhook Verify Token
                </label>
                <input
                  type="text"
                  value={settings.verifyToken}
                  onChange={(e) => setSettings({ ...settings, verifyToken: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Workers */}
        {activeTab === 'workers' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">BullMQ & Queue Limits</h3>
              <p className="text-xs text-slate-500">
                Throughput rate limits to strictly conform with Meta Cloud API Tier 1 constraints
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Messages Per Second Throttler
                </label>
                <input
                  type="number"
                  value={settings.messagesPerSecond}
                  onChange={(e) => setSettings({ ...settings, messagesPerSecond: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Default: 80 msg/sec</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Worker Thread Concurrency
                </label>
                <input
                  type="number"
                  value={settings.workerConcurrency}
                  onChange={(e) => setSettings({ ...settings, workerConcurrency: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Default: 10 parallel jobs</p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                  Asset Storage Quota (GB)
                </label>
                <input
                  type="number"
                  value={settings.storageQuotaGb}
                  onChange={(e) => setSettings({ ...settings, storageQuotaGb: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">Default: 10 GB (Cloudflare R2)</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Opt-Out Keywords */}
        {activeTab === 'optout' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900">DPDP Automated Opt-Out Keywords</h3>
              <p className="text-xs text-slate-500">
                Any incoming WhatsApp reply matching these keywords automatically registers an immutable opt-out
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 mb-1">
                Comma-separated Trigger Keywords
              </label>
              <textarea
                rows={3}
                value={settings.optOutKeywords}
                onChange={(e) => setSettings({ ...settings, optOutKeywords: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono uppercase"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Case-insensitive matching across English, Hindi, Gujarati and Marathi
              </p>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
