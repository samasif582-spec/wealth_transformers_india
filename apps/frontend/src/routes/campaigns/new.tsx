import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  FileText,
  Users,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toast } from '../../components/ui/useToast';
import { Badge } from '../../components/ui/Badge';
import { apiClient } from '../../lib/api-client';

interface TemplateOption {
  id: string;
  name: string;
  category: string;
  language: string;
  quality: string;
  body: string;
  footer?: string | null;
}

export const CampaignCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [availableTemplates, setAvailableTemplates] = useState<TemplateOption[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({
    HNI: 0,
    RETAIL: 0,
    CORPORATE: 0,
    PROSPECT: 0,
  });

  // Wizard state
  const [formData, setFormData] = useState({
    name: '',
    type: 'PROMOTIONAL' as 'PROMOTIONAL' | 'FESTIVAL' | 'BIRTHDAY' | 'ANNIVERSARY',
    templateId: '',
    templateName: '',
    templateBody: '',
    templateFooter: '',
    categories: ['HNI', 'RETAIL'] as string[],
    languages: ['en', 'hi'],
    scheduleType: 'NOW' as 'NOW' | 'SCHEDULED',
    scheduledAt: '',
  });

  useEffect(() => {
    const loadWizardData = async () => {
      try {
        setLoadingTemplates(true);
        const [templatesRes, statsRes] = await Promise.allSettled([
          apiClient.get('/templates?limit=50'),
          apiClient.get('/clients/stats'),
        ]);

        if (templatesRes.status === 'fulfilled') {
          const raw = templatesRes.value.data;
          const list = Array.isArray(raw) ? raw : raw.data || [];
          const formatted: TemplateOption[] = list.map((t: any) => {
            const v = t.versions?.[0];
            return {
              id: t.id,
              name: t.name,
              category: t.category,
              language: t.language || 'en',
              quality: t.qualityRating || 'GREEN',
              body: v?.bodyText || t.body || '',
              footer: v?.footerText || t.footer || '',
            };
          });
          setAvailableTemplates(formatted);
          if (formatted.length > 0) {
            setFormData((prev) => ({
              ...prev,
              templateId: formatted[0].id,
              templateName: formatted[0].name,
              templateBody: formatted[0].body,
              templateFooter: formatted[0].footer || '',
            }));
          }
        }

        if (statsRes.status === 'fulfilled') {
          const s = statsRes.value.data;
          const byCat = s.byCategory || [];
          const countMap: Record<string, number> = { HNI: 0, RETAIL: 0, CORPORATE: 0, PROSPECT: 0 };
          byCat.forEach((c: any) => {
            countMap[c.tier] = c.count;
          });
          setCategoryCounts(countMap);
        }
      } catch (err: any) {
        toast.error('Init Error', err.message);
      } finally {
        setLoadingTemplates(false);
      }
    };

    loadWizardData();
  }, []);

  // Dynamic calculations based on real database records
  const estimatedAudience = formData.categories.reduce((acc, cat) => acc + (categoryCounts[cat] || 0), 0);
  const isMarketing = formData.type === 'PROMOTIONAL' || formData.type === 'FESTIVAL';
  const baseRate = isMarketing ? 0.7854 : 0.1258;
  const totalBaseCost = Math.max(1, estimatedAudience) * baseRate;
  const gstCost = totalBaseCost * 0.18;
  const grandTotalCost = totalBaseCost + gstCost;

  const handleNext = () => {
    if (currentStep === 1 && !formData.name.trim()) {
      toast.error('Campaign Name Required', 'Please enter a descriptive name for this campaign.');
      return;
    }
    if (currentStep === 2 && !formData.templateId) {
      toast.error('Template Required', 'Please select a verified WhatsApp template.');
      return;
    }
    if (currentStep === 3 && formData.categories.length === 0) {
      toast.error('Audience Required', 'Please select at least one client category tier.');
      return;
    }
    setCurrentStep((prev) => Math.min(prev + 1, 5));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    try {
      await apiClient.post('/campaigns', {
        name: formData.name,
        type: formData.type,
        template_id: formData.templateId,
        audience_filters: {
          category: formData.categories as any,
          language: formData.languages,
        },
        scheduled_at:
          formData.scheduleType === 'SCHEDULED' && formData.scheduledAt
            ? new Date(formData.scheduledAt).toISOString()
            : undefined,
      });

      // Trigger celebratory confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
      });

      toast.success(
        'Campaign Created Successfully!',
        `${formData.name} registered and queued for dispatch.`,
      );

      setTimeout(() => {
        navigate('/campaigns');
      }, 1500);
    } catch (err: any) {
      toast.error('Launch Error', err.response?.data?.message || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { number: 1, title: 'Essentials', desc: 'Type & Metadata' },
    { number: 2, title: 'Template', desc: 'Meta Template' },
    { number: 3, title: 'Audience', desc: 'DPDP Filters' },
    { number: 4, title: 'Schedule', desc: 'Dispatch Timing' },
    { number: 5, title: 'Review', desc: 'Verify & Launch' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Top Banner */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Campaign Creation Wizard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          5-step guided orchestration with SEBI disclaimer validation and audience opt-in compliance
        </p>
      </div>

      {/* Wizard Progress Stepper */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="grid grid-cols-5 gap-2">
          {steps.map((s) => {
            const isCompleted = currentStep > s.number;
            const isCurrent = currentStep === s.number;
            return (
              <div
                key={s.number}
                className={`p-3 rounded-xl border text-center transition-all ${
                  isCurrent
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 shadow-xs'
                    : isCompleted
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-400'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                        isCurrent ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {s.number}
                    </span>
                  )}
                  <span
                    className={`text-xs font-bold ${
                      isCurrent
                        ? 'text-blue-700 dark:text-blue-400'
                        : isCompleted
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:block">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8 min-h-[420px]">
        {/* STEP 1: Essentials */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Step 1: Campaign Essentials</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Define the campaign objective and business classification</p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1.5">
                Campaign Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Q3 Market Momentum & Alpha Advisory"
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                Campaign Classification Type *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { id: 'PROMOTIONAL', label: 'Promotional', desc: 'Market insights & offers' },
                  { id: 'FESTIVAL', label: 'Festival Greeting', desc: 'Diwali, Holi, New Year' },
                  { id: 'BIRTHDAY', label: 'Birthday Greeting', desc: 'Automated personal wish' },
                  { id: 'ANNIVERSARY', label: 'Anniversary', desc: 'Client account milestone' },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type.id as any })}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      formData.type === type.id
                        ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <span className="font-bold text-sm block text-slate-900 dark:text-white">{type.label}</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-1">{type.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-bold text-slate-800 dark:text-slate-100">SEBI Compliance Rule:</span> Promotional and Festival dispatches undergo supervisory approval prior to execution. Birthday and Anniversary dispatches are exempt when utilizing approved utility templates.
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Template Selection */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Step 2: WhatsApp Meta Template</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select an approved Meta message template with pre-verified SEBI footers
              </p>
            </div>

            {loadingTemplates ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">Loading available templates from database...</div>
            ) : availableTemplates.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">
                No templates found in database. Create a template first in the Templates module.
              </div>
            ) : (
              <div className="space-y-3">
                {availableTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    onClick={() =>
                      setFormData({
                        ...formData,
                        templateId: tpl.id,
                        templateName: tpl.name,
                        templateBody: tpl.body,
                        templateFooter: tpl.footer || '',
                      })
                    }
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      formData.templateId === tpl.id
                        ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">{tpl.name}</span>
                        <Badge variant="success">Quality: {tpl.quality}</Badge>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                        {tpl.category} ({tpl.language})
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700 font-sans leading-relaxed">
                      {tpl.body}
                    </p>
                    {tpl.footer && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-2 italic flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Footer: {tpl.footer}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Audience Segmentation */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Step 3: Audience & Consent Segmentation</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Property P1 Enforcement: Non-opted-in & soft-deleted clients are automatically excluded
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-2">
                Target Category Tiers *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {['HNI', 'RETAIL', 'CORPORATE', 'PROSPECT'].map((cat) => {
                  const isChecked = formData.categories.includes(cat);
                  const count = categoryCounts[cat] || 0;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        const next = isChecked
                          ? formData.categories.filter((c) => c !== cat)
                          : [...formData.categories, cat];
                        setFormData({ ...formData, categories: next });
                      }}
                      className={`p-3.5 rounded-xl border text-center transition-all ${
                        isChecked
                          ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 font-bold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60'
                      }`}
                    >
                      <span className="text-sm block">{cat}</span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block mt-0.5">{count} registered</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase block">
                  Eligible Database Audience
                </span>
                <span className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 mt-0.5 block">
                  {estimatedAudience.toLocaleString()} Clients
                </span>
                <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Zero non-consenting recipients (100% DPDP compliant)
                </span>
              </div>
              <ShieldCheck className="w-10 h-10 text-emerald-600 dark:text-emerald-400 opacity-60" />
            </div>
          </div>
        )}

        {/* STEP 4: Schedule */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Step 4: Dispatch Velocity & Timing</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure real-time immediate broadcast or future scheduling</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, scheduleType: 'NOW' })}
                className={`p-5 rounded-xl border text-left transition-all ${
                  formData.scheduleType === 'NOW'
                    ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60'
                }`}
              >
                <span className="font-bold text-slate-900 dark:text-white block">Send Immediately</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">
                  Enqueue immediately upon supervisor approval
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, scheduleType: 'SCHEDULED' })}
                className={`p-5 rounded-xl border text-left transition-all ${
                  formData.scheduleType === 'SCHEDULED'
                    ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60'
                }`}
              >
                <span className="font-bold text-slate-900 dark:text-white block">Schedule for Later</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 mt-1 block">
                  Automate dispatch on a specific date & time
                </span>
              </button>
            </div>

            {formData.scheduleType === 'SCHEDULED' && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-600 dark:text-slate-400 mb-1">
                  Scheduled Dispatch Timestamp
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            )}

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-800 dark:text-slate-100">Throttling Guarantee:</span> BullMQ will distribute outbound traffic evenly at 80 messages per second to guarantee zero rate-limit breaches on your Meta Cloud API account.
            </div>
          </div>
        )}

        {/* STEP 5: Review & Cost Verification */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Step 5: Review & Statutory Cost Verification</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Confirm campaign parameters, template preview and financial costs</p>
            </div>

            {/* Overview Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-medium">Campaign</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{formData.name}</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-medium">Type</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{formData.type}</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-medium">Target Audience</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">{estimatedAudience} Clients</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500 block font-medium">Dispatch Mode</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block">{formData.scheduleType}</span>
              </div>
            </div>

            {/* Financial Tariffs Breakdown */}
            <div className="p-5 bg-gradient-to-br from-indigo-950 to-slate-900 text-white rounded-2xl border border-indigo-900 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="text-xs uppercase text-indigo-300 font-bold">
                  Statutory Meta India Tariffs (Property P8)
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 bg-indigo-500/20 text-indigo-200 rounded">
                  Rate: ₹{baseRate.toFixed(4)} / msg
                </span>
              </div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Base Outbound Charges ({estimatedAudience} msgs × ₹{baseRate.toFixed(4)})</span>
                <span className="font-mono">₹{totalBaseCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-300">
                <span>Integrated GST (18.0% Statutory)</span>
                <span className="font-mono text-emerald-400">+ ₹{gstCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/10 text-white">
                <span>Total Estimated Campaign Cost</span>
                <span className="font-mono text-lg text-emerald-300">₹{grandTotalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Wizard Footer Controls */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-xs"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {currentStep < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-8 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-98"
          >
            <Sparkles className="w-4 h-4" />
            {isSubmitting ? 'Enqueuing...' : 'Authorize & Launch Campaign'}
          </button>
        )}
      </div>
    </div>
  );
};
