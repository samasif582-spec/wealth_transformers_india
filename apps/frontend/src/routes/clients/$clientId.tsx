import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Gift,
  Mail,
  Phone,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { toast } from '../../components/ui/useToast';
import { apiClient } from '../../lib/api-client';

export const ClientDetailPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient] = useState<any>(null);
  const [consentHistory, setConsentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClientProfile = async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const [clientRes, consentRes] = await Promise.allSettled([
        apiClient.get(`/clients/${clientId}`),
        apiClient.get(`/consent/${clientId}`),
      ]);

      if (clientRes.status === 'fulfilled') {
        setClient(clientRes.value.data);
      }
      if (consentRes.status === 'fulfilled') {
        setConsentHistory(Array.isArray(consentRes.value.data) ? consentRes.value.data : []);
      }
    } catch (err: any) {
      toast.error('Query Error', err.message || 'Client profile not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientProfile();
  }, [clientId]);

  const isOptedIn = client?.communicationConsent === 'OPTED_IN';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link
          to="/clients"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 mb-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Client Directory
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{client?.fullName || 'Client Profile'}</h1>
              <Badge variant={isOptedIn ? 'success' : 'danger'}>
                {client?.communicationConsent || 'PENDING'}
              </Badge>
              <Badge variant="purple">{client?.categoryTier || 'RETAIL'}</Badge>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">ID: {clientId}</p>
          </div>
          <button
            onClick={fetchClientProfile}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Refresh Client"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Profile Details Card */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase flex items-center gap-1.5 mb-1">
              <Phone className="w-3.5 h-3.5" /> WhatsApp Number
            </span>
            <span className="font-bold text-slate-900 dark:text-white font-mono text-sm block">
              {client?.whatsappNumber}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase flex items-center gap-1.5 mb-1">
              <Mail className="w-3.5 h-3.5" /> Email Address
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm block truncate">
              {client?.email || 'N/A'}
            </span>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <span className="text-slate-400 dark:text-slate-400 block font-semibold uppercase flex items-center gap-1.5 mb-1">
              <Gift className="w-3.5 h-3.5 text-pink-500" /> Date of Birth (Greetings)
            </span>
            <span className="font-bold text-slate-900 dark:text-white text-sm block">
              {client?.dateOfBirth ? new Date(client.dateOfBirth).toLocaleDateString('en-IN') : 'Not Recorded'}
            </span>
          </div>
        </div>

        {/* Consent Timeline */}
        <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">DPDP Act 2023 Consent Audit Trail</h3>
            <span className="text-xs text-slate-400 dark:text-slate-500">Append-Only Immutable Records</span>
          </div>

          {consentHistory.length === 0 ? (
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs text-slate-500 dark:text-slate-400">
              No previous consent transitions recorded.
            </div>
          ) : (
            <div className="space-y-2">
              {consentHistory.map((rec: any) => (
                <div
                  key={rec.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{rec.consentStatus}</span>
                    <span className="text-slate-400 dark:text-slate-500 ml-2 font-mono">
                      Via {rec.consentSource} • {new Date(rec.recordedAt).toLocaleString('en-IN')}
                    </span>
                    {rec.reason && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{rec.reason}</p>}
                  </div>
                  <Badge variant={rec.consentStatus === 'OPTED_IN' ? 'success' : 'danger'}>
                    {rec.consentStatus}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
