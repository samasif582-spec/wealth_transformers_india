import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Upload,
  Plus,
  Search,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Edit,
  Eye,
  Filter,
  RefreshCw,
  Gift,
} from 'lucide-react';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { toast } from '../../components/ui/useToast';
import { useAuthStore } from '../../stores/auth.store';
import { apiClient } from '../../lib/api-client';

export interface ClientRecord {
  id: string;
  fullName: string;
  whatsappNumber: string;
  email?: string | null;
  categoryTier: 'RETAIL' | 'HNI' | 'CORPORATE' | 'PROSPECT';
  communicationConsent: 'OPTED_IN' | 'OPTED_OUT' | 'PENDING';
  preferredLanguage: string;
  dateOfBirth?: string | null;
  weddingAnniversary?: string | null;
  createdAt: string;
}

export const ClientsPage: React.FC = () => {
  const { user } = useAuthStore();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [consentFilter, setConsentFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [eraseTarget, setEraseTarget] = useState<ClientRecord | null>(null);

  const [newClient, setNewClient] = useState({
    fullName: '',
    phone: '+91',
    email: '',
    categoryTier: 'RETAIL' as const,
    preferredLanguage: 'hi',
    dateOfBirth: '',
    weddingAnniversary: '',
  });

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 100 };
      if (search.trim()) params.q = search.trim();
      if (categoryFilter !== 'ALL') params.categoryTier = categoryFilter;
      if (consentFilter !== 'ALL') params.communicationConsent = consentFilter;

      const res = await apiClient.get('/clients', { params });
      const cData = res.data;
      const list: ClientRecord[] = Array.isArray(cData) ? cData : cData.data || [];
      setClients(list);
      setTotalCount(cData.total ?? list.length);
    } catch (err: any) {
      toast.error('Query Failed', err.message || 'Could not fetch clients from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchClients();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, categoryFilter, consentFilter]);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.fullName || !newClient.phone) return;

    // Validate E.164 phone
    const cleanPhone = newClient.phone.replace(/\s+/g, '');
    if (!/^\+[1-9]\d{9,14}$/.test(cleanPhone)) {
      toast.error('Invalid Phone', 'Phone number must follow international E.164 format (+91XXXXXXXXXX)');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.post('/clients', {
        fullName: newClient.fullName,
        whatsappNumber: cleanPhone,
        email: newClient.email || undefined,
        categoryTier: newClient.categoryTier,
        preferredLanguage: newClient.preferredLanguage,
        communicationConsent: 'OPTED_IN',
        dateOfBirth: newClient.dateOfBirth ? new Date(newClient.dateOfBirth).toISOString() : undefined,
        weddingAnniversary: newClient.weddingAnniversary ? new Date(newClient.weddingAnniversary).toISOString() : undefined,
      });

      toast.success('Client Registered', `${newClient.fullName} registered with verified OPTED_IN consent`);
      setIsAddModalOpen(false);
      setNewClient({
        fullName: '',
        phone: '+91',
        email: '',
        categoryTier: 'RETAIL',
        preferredLanguage: 'hi',
        dateOfBirth: '',
        weddingAnniversary: '',
      });
      fetchClients();
    } catch (err: any) {
      toast.error('Enrollment Failed', err.response?.data?.message || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleConsent = async (client: ClientRecord) => {
    try {
      if (client.communicationConsent === 'OPTED_IN') {
        await apiClient.post('/consent/opt-out', {
          clientId: client.id,
          reason: 'Manual opt-out by operator',
          source: 'MANUAL_ENTRY',
        });
        toast.info('Consent Revoked', `${client.fullName} opted out (excluded from future broadcasts)`);
      } else {
        await apiClient.post('/consent/opt-in', {
          clientId: client.id,
          reason: 'Explicit client consent recorded',
          source: 'MANUAL_ENTRY',
        });
        toast.success('Consent Granted', `${client.fullName} opted in to WhatsApp communications`);
      }
      fetchClients();
    } catch (err: any) {
      toast.error('Consent Update Error', err.response?.data?.message || err.message);
    }
  };

  const handleEraseClient = async () => {
    if (!eraseTarget) return;
    try {
      await apiClient.post(`/clients/${eraseTarget.id}/erasure`, {
        confirmed: true,
        reason: 'DPDP Act 2023 Right-to-Erasure requested by customer',
      });
      toast.success('DPDP Erasure Completed', `Client ${eraseTarget.fullName} irreversibly pseudonymized and logs redacted`);
      setEraseTarget(null);
      fetchClients();
    } catch (err: any) {
      toast.error('Erasure Failed', err.response?.data?.message || err.message);
    }
  };

  const columns: Column<ClientRecord>[] = [
    {
      key: 'fullName',
      header: 'Client Identity',
      render: (c) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{c.fullName}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{c.whatsappNumber}</p>
          {c.email && <p className="text-[11px] text-slate-400 dark:text-slate-500">{c.email}</p>}
        </div>
      ),
    },
    {
      key: 'categoryTier',
      header: 'Category Tier',
      render: (c) => {
        const variants: Record<string, any> = {
          HNI: 'purple',
          CORPORATE: 'info',
          RETAIL: 'success',
          PROSPECT: 'default',
        };
        return <Badge variant={variants[c.categoryTier] ?? 'default'}>{c.categoryTier}</Badge>;
      },
    },
    {
      key: 'communicationConsent',
      header: 'Consent (DPDP P1)',
      render: (c) => {
        const isOptedIn = c.communicationConsent === 'OPTED_IN';
        const isOptedOut = c.communicationConsent === 'OPTED_OUT';
        return (
          <Badge variant={isOptedIn ? 'success' : isOptedOut ? 'danger' : 'warning'}>
            {c.communicationConsent}
          </Badge>
        );
      },
    },
    {
      key: 'preferredLanguage',
      header: 'Locale / DOB',
      render: (c) => {
        const dobFormatted = c.dateOfBirth
          ? new Date(c.dateOfBirth).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
          : null;
        return (
          <div>
            <span className="text-xs uppercase font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              {c.preferredLanguage}
            </span>
            {dobFormatted && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                <Gift className="w-3 h-3 text-pink-500" /> {dobFormatted}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (c) => {
        const isErased = c.fullName.startsWith('ERASED_');
        return (
          <div className="flex items-center gap-2">
            {!isErased && (
              <>
                <button
                  onClick={() => handleToggleConsent(c)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                    c.communicationConsent === 'OPTED_IN'
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                  }`}
                >
                  {c.communicationConsent === 'OPTED_IN' ? 'Opt-Out' : 'Opt-In'}
                </button>
                {(user?.role === 'Super_Admin' || user?.role === 'Admin') && (
                  <button
                    onClick={() => setEraseTarget(c)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                    title="DPDP Right-to-Erasure (Anonymize PII)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Client Directory & DPDP Consent</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Maintain verified customer registry, communication consent history and automated greeting metadata
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchClients}
            disabled={loading}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/clients/import"
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-medium shadow-xs transition-colors"
          >
            <Upload className="w-4 h-4" /> Import CSV
          </Link>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by client name, mobile (+91...) or email..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Categories</option>
            <option value="HNI">HNI Clients</option>
            <option value="RETAIL">Retail Investors</option>
            <option value="CORPORATE">Corporate Accounts</option>
            <option value="PROSPECT">Prospects</option>
          </select>
          <select
            value={consentFilter}
            onChange={(e) => setConsentFilter(e.target.value)}
            className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">All Consents</option>
            <option value="OPTED_IN">Opted-In (Audience Eligible)</option>
            <option value="OPTED_OUT">Opted-Out (Excluded P1)</option>
            <option value="PENDING">Pending Consent</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <DataTable
        columns={columns}
        data={clients}
        total={totalCount}
        emptyTitle="No clients match your filter criteria"
        emptySubtitle="Try adjusting search terms or add a new client to the registry."
      />

      {/* Add Client Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Client Record"
        description="Ensure mobile numbers conform to international E.164 standards for WhatsApp delivery."
      >
        <form onSubmit={handleAddClient} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              Full Legal Name *
            </label>
            <input
              type="text"
              required
              value={newClient.fullName}
              onChange={(e) => setNewClient({ ...newClient, fullName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Anand Mahindra"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
              WhatsApp Mobile (E.164 Standard) *
            </label>
            <input
              type="text"
              required
              value={newClient.phone}
              onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="+9198XXXXXXXX"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Must start with country code e.g. +91 for India</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Category Tier
              </label>
              <select
                value={newClient.categoryTier}
                onChange={(e) => setNewClient({ ...newClient, categoryTier: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm outline-none"
              >
                <option value="RETAIL">Retail Investor</option>
                <option value="HNI">HNI Client</option>
                <option value="CORPORATE">Corporate</option>
                <option value="PROSPECT">Prospect</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Language Preference
              </label>
              <select
                value={newClient.preferredLanguage}
                onChange={(e) => setNewClient({ ...newClient, preferredLanguage: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm outline-none"
              >
                <option value="hi">Hindi (hi)</option>
                <option value="en">English (en)</option>
                <option value="gu">Gujarati (gu)</option>
                <option value="mr">Marathi (mr)</option>
                <option value="ta">Tamil (ta)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Date of Birth (For Greetings)
              </label>
              <input
                type="date"
                value={newClient.dateOfBirth}
                onChange={(e) => setNewClient({ ...newClient, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                Corporate Email
              </label>
              <input
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg text-sm outline-none"
                placeholder="client@domain.com"
              />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Enrolling...' : 'Enroll Client'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DPDP Erasure Dialog */}
      <ConfirmDialog
        isOpen={Boolean(eraseTarget)}
        onClose={() => setEraseTarget(null)}
        onConfirm={handleEraseClient}
        title="Execute DPDP Right to Erasure"
        message={`Are you sure you want to permanently erase personal data for ${eraseTarget?.fullName}? Under DPDP Act 2023, this will irreversibly pseudonymize the client identity as 'ERASED_${eraseTarget?.id}' and redact all personal message logs.`}
        confirmLabel="Irreversibly Erase Data"
        variant="danger"
      />
    </div>
  );
};
