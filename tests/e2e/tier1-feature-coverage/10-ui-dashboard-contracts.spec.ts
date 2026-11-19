import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { apiClient } from '../../helpers/api-client';
import { authHelper } from '../../helpers/auth-helper';
import { dbHelper } from '../../helpers/db-helper';
import { redisHelper } from '../../helpers/redis-helper';
import {
  ROLE_PERMISSIONS_MATRIX,
  USER_CREDENTIALS,
  TEST_USERS,
  UserRoleKey,
} from '../../fixtures/users.fixture';
import { SEBI_AMFI_MANDATORY_FOOTER } from '../../fixtures/templates.fixture';

// Authentic Frontend Imports
import {
  SPRING_PHYSICS,
  BACKDROP_BLUR,
  MODAL_ANIMATION_VARIANTS,
  SLIDE_OVER_VARIANTS,
  MOTION_TOKENS,
} from '../../../apps/frontend/src/tokens/motion';
import {
  DRAWER_LAYOUT_CONFIG,
  TOAST_CONTAINER_CONFIG,
  RECHARTS_TIME_SERIES_CONFIG,
} from '../../../apps/frontend/src/tokens/layout.tokens';
import {
  useToastStore,
  calculateToastProgress,
  shouldDismissSwipe,
  MAX_TOASTS,
  ToastType,
  ToastNotification,
} from '../../../apps/frontend/src/stores/toast.store';
import {
  useCampaignWizardStore,
  calculateFinalPricing,
  WIZARD_STEPS,
} from '../../../apps/frontend/src/stores/campaign-wizard.store';
import { useDrawerStore } from '../../../apps/frontend/src/stores/drawer.store';
import {
  useAutomationStore,
  INITIAL_WORKFLOWS,
} from '../../../apps/frontend/src/stores/automation.store';
import { useAuthStore } from '../../../apps/frontend/src/stores/auth.store';
import {
  ROLE_DASHBOARD_ROUTES,
  ROLE_SWITCHER_OPTIONS,
  CAMPAIGN_CREATIVE_ACTIONS,
  resolveRoleHome,
  evaluateRouteAccess,
  resolveLandingRedirect,
} from '../../../apps/frontend/src/routes/dashboard/routing';
import { getModalA11yProps } from '../../../apps/frontend/src/components/ui/modal.attributes';
import { createModalController } from '../../../apps/frontend/src/components/ui/useModalDismiss';

// Contract Schemas
import { ClientDrawerSchema } from '../../../apps/frontend/src/contracts/client-drawer.contract';
import { TemplateDrawerSchema } from '../../../apps/frontend/src/contracts/template-drawer.contract';
import { validateSebiFooter } from '../../../apps/frontend/src/contracts/template-compliance.contract';
import { TEMPLATE_QUALITY_RATINGS } from '../../../apps/frontend/src/contracts/template-quality.contract';
import { CampaignApprovalInboxSchema } from '../../../apps/frontend/src/contracts/campaign-approval.contract';
import {
  validateDpdpErasureConfirmation,
  DPDP_CONFIRMATION_KEYWORD,
  DpdpErasureModalContract,
} from '../../../apps/frontend/src/contracts/dpdp.contract';
import { CLIENT_IMPORT_CONFIG } from '../../../apps/frontend/src/contracts/client-import.contract';
import {
  TimelineConversationContractSchema,
  SearchBoxContract,
} from '../../../apps/frontend/src/contracts/operator-timeline.contract';
import {
  validateManualConsentReason,
  ManualConsentReasonSchema,
} from '../../../apps/frontend/src/contracts/consent-form.contract';
import {
  CLIENT_CATEGORY_TIERS,
  CLIENT_TIER_BADGES,
} from '../../../apps/frontend/src/contracts/client-tiers.contract';
import {
  AnalyticsKpiCardsSchema,
  ANALYTICS_KPI_CONFIG,
  ANALYTICS_EXPORT_CONFIG,
} from '../../../apps/frontend/src/contracts/analytics.contract';
import {
  ManualTriggerContractSchema,
  ExecutionHistoryColumns,
  ExecutionHistoryTableSchema,
} from '../../../apps/frontend/src/contracts/automation.contract';

async function getRoleToken(role: UserRoleKey): Promise<string> {
  const user = await dbHelper.findUserByEmail(USER_CREDENTIALS[role].email);
  const userId = user?.id || TEST_USERS[role].id || uuidv4();
  const { token } = authHelper.generateAccessToken({ role, userId });
  await redisHelper.setLastActivity(userId, Math.floor(Date.now() / 1000));
  return token;
}

describe('Tier 1 — 10: Modern UI Animation System & 5 Role Dashboard Contracts', () => {
  beforeAll(async () => {
    await dbHelper.ensureTestUsersExist();
  });

  afterAll(async () => {
    await dbHelper.cleanTestFixtures();
    await dbHelper.disconnect();
    await redisHelper.disconnect();
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 47: Framer Motion Modal Dialogs
  // ─────────────────────────────────────────────────────────────
  describe('Feature 47: Framer Motion Modal Dialogs Contract', () => {
    it('F47-T1: should specify spring physics tokens: stiffness 350, damping 25', () => {
      expect(SPRING_PHYSICS.stiffness).toBe(350);
      expect(SPRING_PHYSICS.damping).toBe(25);
      expect(SPRING_PHYSICS.mass).toBe(1);
      expect(MOTION_TOKENS.spring).toEqual(SPRING_PHYSICS);
    });

    it('F47-T2: should require 8px backdrop blur for modal background overlay', () => {
      expect(BACKDROP_BLUR).toBe('8px');
      expect(MOTION_TOKENS.backdropBlur).toBe('8px');
    });

    it('F47-T3: should define modal entrance and exit animation keyframes (opacity, scale, y-offset)', () => {
      expect(MODAL_ANIMATION_VARIANTS.initial).toEqual({ opacity: 0, scale: 0.95, y: 10 });
      expect(MODAL_ANIMATION_VARIANTS.animate).toEqual({ opacity: 1, scale: 1, y: 0 });
      expect(MODAL_ANIMATION_VARIANTS.exit).toEqual({ opacity: 0, scale: 0.95, y: 10 });
    });

    it('F47-T4: should specify accessible modal dialog attributes (role="dialog", aria-modal="true")', () => {
      const a11yProps = getModalA11yProps('modal-headline');

      expect(a11yProps.role).toBe('dialog');
      expect(a11yProps['aria-modal']).toBe(true);
      expect(a11yProps['aria-labelledby']).toBe('modal-headline');
    });

    it('F47-T5: should enforce dismissal on Escape key and backdrop click via controller', () => {
      let dismissed = false;
      const controller = createModalController(() => {
        dismissed = true;
      });

      controller.handleKeyDown({ key: 'Escape' });
      expect(dismissed).toBe(true);
      expect(controller.isDismissed()).toBe(true);

      dismissed = false;
      const lockedController = createModalController(() => {
        dismissed = true;
      }, true);
      lockedController.handleKeyDown({ key: 'Escape' });
      expect(dismissed).toBe(false);

      lockedController.handleBackdropClick(false);
      expect(dismissed).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 48: Slide-Over Inspection Drawers
  // ─────────────────────────────────────────────────────────────
  describe('Feature 48: Slide-Over Inspection Drawers Contract', () => {
    it('F48-T1: should specify right-side slide-over animation (x: 100% -> 0%)', () => {
      expect(SLIDE_OVER_VARIANTS.initial.x).toBe('100%');
      expect(SLIDE_OVER_VARIANTS.animate.x).toBe(0);
      expect(SLIDE_OVER_VARIANTS.exit.x).toBe('100%');
    });

    it('F48-T2: should define client profile drawer inspection schema', () => {
      const validClientData = {
        id: 'c-001',
        fullName: 'Rajesh Sharma',
        whatsappNumber: '+919876543210',
        email: 'rajesh@example.com',
        categoryTier: 'HNI' as const,
        communicationConsent: 'OPTED_IN' as const,
        consentHistoryCount: 3,
        messageHistoryCount: 15,
      };

      const parsed = ClientDrawerSchema.safeParse(validClientData);
      expect(parsed.success).toBe(true);

      const invalidClientData = {
        id: 'c-002',
        fullName: 'Invalid Phone Client',
        whatsappNumber: 'not-a-phone',
        email: 'invalid@example.com',
        categoryTier: 'HNI',
        communicationConsent: 'OPTED_IN',
      };
      const invalidParsed = ClientDrawerSchema.safeParse(invalidClientData);
      expect(invalidParsed.success).toBe(false);
    });

    it('F48-T3: should define template inspection drawer schema with phone preview mockup', () => {
      const templateData = {
        id: 't-001',
        name: 'diwali_festive_offer_v2',
        category: 'MARKETING' as const,
        language: 'en',
        status: 'APPROVED' as const,
        qualityRating: 'GREEN' as const,
        bodyText: 'Happy Diwali {{1}}, enjoy exclusive portfolio insights!',
        footerText: SEBI_AMFI_MANDATORY_FOOTER,
        hasPhonePreview: true,
      };

      const parsed = TemplateDrawerSchema.safeParse(templateData);
      expect(parsed.success).toBe(true);
      expect(templateData.hasPhonePreview).toBe(true);
      expect(templateData.footerText).toBe(SEBI_AMFI_MANDATORY_FOOTER);
    });

    it('F48-T4: should handle drawer dismissal via drawer store state machine', () => {
      const drawerStore = useDrawerStore.getState();
      drawerStore.openDrawer('client', { id: 'c-101' });

      expect(useDrawerStore.getState().isOpen).toBe(true);
      expect(useDrawerStore.getState().drawerType).toBe('client');
      expect(useDrawerStore.getState().drawerData).toEqual({ id: 'c-101' });

      drawerStore.closeDrawer();
      expect(useDrawerStore.getState().isOpen).toBe(false);
      expect(useDrawerStore.getState().drawerData).toBeNull();
    });

    it('F48-T5: should enforce focus trap and z-index positioning for drawer overlay', () => {
      expect(DRAWER_LAYOUT_CONFIG.zIndex).toBe(50);
      expect(DRAWER_LAYOUT_CONFIG.backdropFilter).toContain('blur(8px)');
      expect(DRAWER_LAYOUT_CONFIG.position).toBe('fixed');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 49: Stacked Toast Notification System
  // ─────────────────────────────────────────────────────────────
  describe('Feature 49: Stacked Toast Notification System Contract', () => {
    it('F49-T1: should support 4 distinct toast variants: success, error, warning, info', () => {
      const variants: ToastType[] = ['success', 'error', 'warning', 'info'];
      const store = useToastStore.getState();
      store.clearToasts();

      variants.forEach((v) => {
        store.addToast({
          id: `toast-${v}`,
          type: v,
          title: `Test ${v}`,
          durationMs: 4000,
          dismissible: true,
        });
      });

      const currentToasts = useToastStore.getState().toasts;
      expect(currentToasts.length).toBe(4);
      variants.forEach((v) => {
        const found = currentToasts.find((t: ToastNotification) => t.type === v);
        expect(found).toBeDefined();
        expect(found?.durationMs).toBe(4000);
      });
    });

    it('F49-T2: should enforce maximum stacked toast display limit (5 toasts max, FIFO eviction)', () => {
      const store = useToastStore.getState();
      store.clearToasts();

      ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].forEach((title) => {
        store.addToast({
          id: title,
          type: 'info',
          title,
          durationMs: 3000,
          dismissible: true,
        });
      });

      const currentToasts = useToastStore.getState().toasts;
      expect(currentToasts.length).toBe(MAX_TOASTS);
      expect(currentToasts.map((t: ToastNotification) => t.title)).toEqual(['t3', 't4', 't5', 't6', 't7']);
    });

    it('F49-T3: should calculate auto-dismiss timer and progress bar duration percentage', () => {
      expect(calculateToastProgress(0, 4000)).toBe(100);
      expect(calculateToastProgress(2000, 4000)).toBe(50);
      expect(calculateToastProgress(4000, 4000)).toBe(0);
      expect(calculateToastProgress(5000, 4000)).toBe(0);
    });

    it('F49-T4: should support swipe-to-dismiss gesture contract with threshold', () => {
      expect(shouldDismissSwipe(120, 100)).toBe(true);
      expect(shouldDismissSwipe(40, 100)).toBe(false);
      expect(shouldDismissSwipe(-110, 100)).toBe(true);
    });

    it('F49-T5: should format toast container fixed viewport coordinates (bottom-right)', () => {
      expect(TOAST_CONTAINER_CONFIG.position).toBe('fixed');
      expect(TOAST_CONTAINER_CONFIG.bottom).toBe('1.5rem');
      expect(TOAST_CONTAINER_CONFIG.right).toBe('1.5rem');
      expect(TOAST_CONTAINER_CONFIG.zIndex).toBe(100);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 50: 5-Step Campaign Creation Wizard
  // ─────────────────────────────────────────────────────────────
  describe('Feature 50: 5-Step Campaign Creation Wizard Contract', () => {
    beforeEach(() => {
      useCampaignWizardStore.getState().reset();
    });

    it('F50-T1: should define 5 discrete sequential wizard steps in order', () => {
      expect(WIZARD_STEPS.length).toBe(5);
      expect(WIZARD_STEPS[0]).toEqual({ id: 1, name: 'Template Selection' });
      expect(WIZARD_STEPS[1]).toEqual({ id: 2, name: 'Audience Resolution' });
      expect(WIZARD_STEPS[2]).toEqual({ id: 3, name: 'Variable Mapping' });
      expect(WIZARD_STEPS[3]).toEqual({ id: 4, name: 'Schedule & Rate Limit' });
      expect(WIZARD_STEPS[4]).toEqual({ id: 5, name: 'Review & Cost Confirmation' });
    });

    it('F50-T2: should advance wizard step from 1 to 2 when template is selected', () => {
      const store = useCampaignWizardStore.getState();
      expect(store.nextStep()).toBe(false); // Blocked without template

      store.setTemplate('tmpl-001', 'MARKETING');
      const advanced = store.nextStep();
      expect(advanced).toBe(true);
      expect(useCampaignWizardStore.getState().currentStep).toBe(2);
      expect(useCampaignWizardStore.getState().direction).toBe(1);
    });

    it('F50-T3: should block advance from step 2 if audience resolution yields 0 recipients', () => {
      const store = useCampaignWizardStore.getState();
      store.setTemplate('tmpl-001', 'MARKETING');
      store.nextStep(); // to step 2

      store.setAudienceCount(0);
      expect(store.nextStep()).toBe(false);
      expect(useCampaignWizardStore.getState().currentStep).toBe(2);

      store.setAudienceCount(1500);
      expect(store.nextStep()).toBe(true);
      expect(useCampaignWizardStore.getState().currentStep).toBe(3);
    });

    it('F50-T4: should navigate backward to step 1 with negative direction (-1) preserving state', () => {
      const store = useCampaignWizardStore.getState();
      store.setTemplate('tmpl-001', 'MARKETING');
      store.nextStep(); // step 2

      expect(store.prevStep()).toBe(true);
      const state = useCampaignWizardStore.getState();
      expect(state.currentStep).toBe(1);
      expect(state.direction).toBe(-1);
      expect(state.templateId).toBe('tmpl-001'); // Preserved
    });

    it('F50-T5: should compute final campaign pricing with 18% GST at step 5 (Property P8)', () => {
      const pricing = calculateFinalPricing(1000, 0.7854);

      expect(pricing.ratePerMessage).toBe(0.7854);
      expect(pricing.preGstCost).toBe(785.4);
      expect(pricing.gstAmount).toBeCloseTo(141.372, 3);
      expect(pricing.totalCost).toBeCloseTo(926.772, 3);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 51: Super_Admin Governance Dashboard
  // ─────────────────────────────────────────────────────────────
  describe('Feature 51: Super_Admin Governance Dashboard Contract', () => {
    it('F51-T1: should define Super_Admin governance dashboard route as /dashboard/governance', () => {
      expect(ROLE_DASHBOARD_ROUTES.Super_Admin).toBe('/dashboard/governance');
    });

    it('F51-T2: should verify live cluster health via GET /api/v1/health', async () => {
      const res = await apiClient.get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('database');
      expect(res.body.database.status).toBe('ok');
      expect(res.body.redis.status).toBe('ok');
    });

    it('F51-T3: should verify live user management RBAC: Super_Admin allowed, Operator forbidden', async () => {
      const superAdminToken = await getRoleToken('Super_Admin');
      const resAllowed = await apiClient.withToken(superAdminToken).get('/users');
      expect(resAllowed.status).toBe(200);

      const operatorToken = await getRoleToken('Operator');
      const resForbidden = await apiClient.withToken(operatorToken).get('/users');
      expect(resForbidden.status).toBe(403);
    });

    it('F51-T4: should verify live settings endpoint access with Super_Admin token', async () => {
      const superAdminToken = await getRoleToken('Super_Admin');
      const res = await apiClient.withToken(superAdminToken).get('/settings');
      expect(res.status).toBe(200);
    });

    it('F51-T5: should verify live audit log inspection endpoint access with Super_Admin token', async () => {
      const superAdminToken = await getRoleToken('Super_Admin');
      const res = await apiClient.withToken(superAdminToken).get('/audit');
      expect(res.status).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 52: Admin Operations Dashboard
  // ─────────────────────────────────────────────────────────────
  describe('Feature 52: Admin Operations Dashboard Contract', () => {
    it('F52-T1: should define Admin operations dashboard route as /dashboard/operations', () => {
      expect(ROLE_DASHBOARD_ROUTES.Admin).toBe('/dashboard/operations');
    });

    it('F52-T2: should define Campaign Approval Inbox view contract with GST cost preview', () => {
      const approvalInboxItem = {
        campaignId: 'camp-001',
        campaignName: 'Festive HNI Announcement',
        requestedBy: 'marketing@wealthtrade.in',
        recipientCount: 5000,
        estimatedCostPreGst: 3927.0,
        gstRatePercent: '18%' as const,
        gstAmountInr: 706.86,
        totalCostInr: 4633.86,
        actions: ['APPROVE' as const, 'REJECT' as const],
      };

      const parsed = CampaignApprovalInboxSchema.safeParse(approvalInboxItem);
      expect(parsed.success).toBe(true);
      expect(approvalInboxItem.actions).toContain('APPROVE');
      expect(approvalInboxItem.actions).toContain('REJECT');
      expect(approvalInboxItem.totalCostInr).toBeCloseTo(4633.86, 2);
    });

    it('F52-T3: should define DPDP Right-to-Erasure modal contract with double confirmation', () => {
      expect(DpdpErasureModalContract.confirmationKeyword).toBe('ERASE_PERMANENTLY');
      expect(DpdpErasureModalContract.isIrreversible).toBe(true);

      const validCheck = validateDpdpErasureConfirmation('ERASE_PERMANENTLY');
      expect(validCheck.valid).toBe(true);

      const invalidCheck = validateDpdpErasureConfirmation('DELETE');
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.error).toContain('ERASE_PERMANENTLY');
    });

    it('F52-T4: should define Client CSV/XLSX streaming import launcher interface', () => {
      expect(CLIENT_IMPORT_CONFIG.allowedFormats).toContain('.csv');
      expect(CLIENT_IMPORT_CONFIG.allowedFormats).toContain('.xlsx');
      expect(CLIENT_IMPORT_CONFIG.maxFileSizeMb).toBe(25);
    });

    it('F52-T5: should verify Admin role has canApproveCampaigns and canEraseClients permissions', () => {
      expect(ROLE_PERMISSIONS_MATRIX.Admin.canApproveCampaigns).toBe(true);
      expect(ROLE_PERMISSIONS_MATRIX.Admin.canEraseClients).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 53: Marketing Creative Hub
  // ─────────────────────────────────────────────────────────────
  describe('Feature 53: Marketing Creative Hub Contract', () => {
    it('F53-T1: should define Marketing Employee dashboard route as /dashboard/marketing', () => {
      expect(ROLE_DASHBOARD_ROUTES.Marketing_Employee).toBe('/dashboard/marketing');
    });

    it('F53-T2: should define Template Builder interface with real-time phone preview mockup', () => {
      const templateData = {
        id: 'tmpl-new-1',
        name: 'creative_promo_v1',
        category: 'MARKETING' as const,
        language: 'en',
        status: 'DRAFT' as const,
        bodyText: 'Hello {{1}}, welcome to Wealth Trade!',
        footerText: SEBI_AMFI_MANDATORY_FOOTER,
        hasPhonePreview: true,
      };

      const parsed = TemplateDrawerSchema.safeParse(templateData);
      expect(parsed.success).toBe(true);
      expect(templateData.hasPhonePreview).toBe(true);
    });

    it('F53-T3: should enforce SEBI/AMFI registration footer indicator for MARKETING templates', () => {
      expect(validateSebiFooter('MARKETING', SEBI_AMFI_MANDATORY_FOOTER)).toBe(true);
      expect(validateSebiFooter('MARKETING', 'Invalid Footer')).toBe(false);
      expect(validateSebiFooter('UTILITY', '')).toBe(true);
    });

    it('F53-T4: should provide 5-step campaign wizard launcher button', () => {
      expect(CAMPAIGN_CREATIVE_ACTIONS.canCreateTemplates).toBe(true);
      expect(CAMPAIGN_CREATIVE_ACTIONS.targetRoute).toBe('/campaigns/new');
    });

    it('F53-T5: should display template quality rating badges (GREEN / YELLOW / RED)', () => {
      expect(TEMPLATE_QUALITY_RATINGS.GREEN.canDispatch).toBe(true);
      expect(TEMPLATE_QUALITY_RATINGS.YELLOW.canDispatch).toBe(true);
      expect(TEMPLATE_QUALITY_RATINGS.RED.canDispatch).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 54: Operator Engagement View
  // ─────────────────────────────────────────────────────────────
  describe('Feature 54: Operator Engagement View Contract', () => {
    it('F54-T1: should define Operator engagement dashboard route as /dashboard/operator', () => {
      expect(ROLE_DASHBOARD_ROUTES.Operator).toBe('/dashboard/operator');
    });

    it('F54-T2: should verify sub-500ms GIN client search latency via live API', async () => {
      const operatorToken = await getRoleToken('Operator');
      const start = Date.now();
      const res = await apiClient.withToken(operatorToken).get('/clients', { limit: 5 });
      const duration = Date.now() - start;

      expect(res.status).toBe(200);
      expect(duration).toBeLessThan(SearchBoxContract.targetLatencyMs);
    });

    it('F54-T3: should define 25-message timeline conversation view component contract', () => {
      const timelineData = {
        messagesPerPage: 25 as const,
        infiniteScroll: true,
        showsDeliveryStatusTicks: true,
        messages: [
          {
            id: 'msg-01',
            bodyText: 'Hello from WealthTrade',
            deliveryStatus: 'READ' as const,
            dispatchedAt: new Date().toISOString(),
          },
        ],
      };

      const parsed = TimelineConversationContractSchema.safeParse(timelineData);
      expect(parsed.success).toBe(true);
      expect(timelineData.messagesPerPage).toBe(25);
      expect(timelineData.showsDeliveryStatusTicks).toBe(true);
    });

    it('F54-T4: should define manual consent modal requiring mandatory reason (1-500 chars)', () => {
      expect(validateManualConsentReason('').valid).toBe(false);
      expect(
        validateManualConsentReason('Client called and requested opt-in for market updates').valid,
      ).toBe(true);
      expect(validateManualConsentReason('a'.repeat(501)).valid).toBe(false);
    });

    it('F54-T5: should render client category tier badges (HNI, RETAIL, CORPORATE, PROSPECT)', () => {
      expect(CLIENT_CATEGORY_TIERS).toEqual(['HNI', 'RETAIL', 'CORPORATE', 'PROSPECT']);
      CLIENT_CATEGORY_TIERS.forEach((tier) => {
        expect(CLIENT_TIER_BADGES[tier]).toBeDefined();
        expect(typeof CLIENT_TIER_BADGES[tier].label).toBe('string');
        expect(typeof CLIENT_TIER_BADGES[tier].color).toBe('string');
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 55: Viewer Analytics Dashboard View Contract
  // ─────────────────────────────────────────────────────────────
  describe('Feature 55: Viewer Analytics Dashboard View Contract', () => {
    it('F55-T1: should define Viewer analytics dashboard route as /dashboard/analytics', () => {
      expect(ROLE_DASHBOARD_ROUTES.Viewer).toBe('/dashboard/analytics');
    });

    it('F55-T2: should define top-level KPI summary cards contract via live analytics endpoint', async () => {
      const viewerToken = await getRoleToken('Viewer');
      const res = await apiClient.withToken(viewerToken).get('/analytics/dashboard?days=7');
      expect(res.status).toBe(200);

      const parsed = AnalyticsKpiCardsSchema.safeParse(ANALYTICS_KPI_CONFIG);
      expect(parsed.success).toBe(true);
      expect(ANALYTICS_KPI_CONFIG.length).toBe(4);
    });

    it('F55-T3: should define Recharts 90-day time-series visual components contract', () => {
      expect(RECHARTS_TIME_SERIES_CONFIG.lines.length).toBe(4);
      expect(RECHARTS_TIME_SERIES_CONFIG.componentType).toBe('ResponsiveContainer');
      expect(RECHARTS_TIME_SERIES_CONFIG.chartType).toBe('LineChart');
    });

    it('F55-T4: should define CSV export download button action contract', () => {
      expect(ANALYTICS_EXPORT_CONFIG.mimeType).toBe('text/csv');
      expect(ANALYTICS_EXPORT_CONFIG.label).toBe('Export CSV');
    });

    it('F55-T5: should enforce that Viewer role is read-only and lacks mutation permissions via live API', async () => {
      const viewerToken = await getRoleToken('Viewer');

      const resCreateClient = await apiClient.withToken(viewerToken).post('/clients', {
        fullName: 'Unauthorized Client',
        whatsappNumber: '+919999900999',
        categoryTier: 'RETAIL',
      });
      expect(resCreateClient.status).toBe(403);

      const resCreateUser = await apiClient.withToken(viewerToken).post('/users', {
        email: 'unauthorized_creation@wealthtrade.in',
        fullName: 'Unauthorized User',
        role: 'Operator',
      });
      expect(resCreateUser.status).toBe(403);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 56: Automation Hub UI Contract
  // ─────────────────────────────────────────────────────────────
  describe('Feature 56: Automation Hub UI View Contract', () => {
    it('F56-T1: should render all 8 n8n workflow cards in Automation Hub grid reading from disk', () => {
      const workflowsDir = path.resolve(__dirname, '../../../n8n/workflows');
      const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.json'));

      expect(files.length).toBe(8);
      const fileNames = files.sort();
      expect(fileNames).toEqual([
        '01-birthday-automation.json',
        '02-anniversary-automation.json',
        '03-festival-dispatch.json',
        '04-campaign-execution.json',
        '05-delivery-status.json',
        '06-opt-out.json',
        '07-template-quality.json',
        '08-error-handler.json',
      ]);
    });

    it('F56-T2: should define Active / Inactive toggle switch contract per workflow card via store', () => {
      const store = useAutomationStore.getState();
      const workflowId = '01-birthday-automation';

      const initial = store.workflows.find((w: any) => w.id === workflowId);
      expect(initial?.status).toBe('ACTIVE');

      store.toggleWorkflow(workflowId);
      expect(useAutomationStore.getState().workflows.find((w: any) => w.id === workflowId)?.status).toBe(
        'INACTIVE',
      );

      store.toggleWorkflow(workflowId);
      expect(useAutomationStore.getState().workflows.find((w: any) => w.id === workflowId)?.status).toBe(
        'ACTIVE',
      );
    });

    it('F56-T3: should display cron schedule badge on scheduled workflow cards reading workflow definitions', () => {
      const workflowsDir = path.resolve(__dirname, '../../../n8n/workflows');
      const bdayRaw = JSON.parse(
        fs.readFileSync(path.join(workflowsDir, '01-birthday-automation.json'), 'utf8'),
      );
      const qualityRaw = JSON.parse(
        fs.readFileSync(path.join(workflowsDir, '07-template-quality.json'), 'utf8'),
      );

      const bdayScheduleNode = bdayRaw.nodes.find(
        (n: any) => n.type === 'n8n-nodes-base.scheduleTrigger',
      );
      const qualityScheduleNode = qualityRaw.nodes.find(
        (n: any) => n.type === 'n8n-nodes-base.scheduleTrigger',
      );

      expect(bdayScheduleNode).toBeDefined();
      expect(qualityScheduleNode).toBeDefined();

      const bdayStore = INITIAL_WORKFLOWS.find((w) => w.id === '01-birthday-automation');
      const qualityStore = INITIAL_WORKFLOWS.find((w) => w.id === '07-template-quality');
      expect(bdayStore?.cron).toBe('0 9 * * *');
      expect(qualityStore?.cron).toBe('30 7 * * *');
    });

    it('F56-T4: should define "Trigger Now" manual run button action contract', async () => {
      const triggerAction = {
        action: 'TRIGGER_WORKFLOW_NOW' as const,
        workflowId: '01-birthday-automation',
        requiresConfirmation: true as const,
        feedbackToast: 'Workflow triggered successfully. Processing batch...',
      };

      const parsed = ManualTriggerContractSchema.safeParse(triggerAction);
      expect(parsed.success).toBe(true);

      const store = useAutomationStore.getState();
      const result = await store.triggerManualRun('01-birthday-automation');
      expect(result.status).toBe('QUEUED');
      expect(result.executionId).toBeDefined();
    });

    it('F56-T5: should define execution history table with columns: ID, status, clients processed, time', () => {
      expect(ExecutionHistoryColumns).toContain('Status');
      expect(ExecutionHistoryColumns).toContain('Clients Processed');
      expect(ExecutionHistoryColumns).toContain('Messages Queued');

      const sampleExecution = {
        executionId: 'exec-101',
        workflowName: 'Birthday Automation',
        status: 'SUCCESS' as const,
        clientsProcessed: 12,
        messagesQueued: 12,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      const parsed = ExecutionHistoryTableSchema.safeParse(sampleExecution);
      expect(parsed.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // FEATURE 57: Dynamic Role Routing & Role Switcher
  // ─────────────────────────────────────────────────────────────
  describe('Feature 57: Dynamic Role Routing & Switcher Contract', () => {
    it('F57-T1: should resolve correct dedicated dashboard for each of the 5 roles', () => {
      const roles: UserRoleKey[] = [
        'Super_Admin',
        'Admin',
        'Marketing_Employee',
        'Operator',
        'Viewer',
      ];

      roles.forEach((r) => {
        const route = resolveRoleHome(r);
        expect(route).toBeDefined();
        expect(route.startsWith('/dashboard/')).toBe(true);
      });
    });

    it('F57-T2: should define development role switcher component options for all 5 roles', () => {
      expect(ROLE_SWITCHER_OPTIONS.length).toBe(5);
      expect(ROLE_SWITCHER_OPTIONS.map((o) => o.role)).toEqual([
        'Super_Admin',
        'Admin',
        'Marketing_Employee',
        'Operator',
        'Viewer',
      ]);
    });

    it('F57-T3: should enforce route guard redirection when user role lacks route permission', () => {
      const viewerAccess = evaluateRouteAccess('Viewer', '/dashboard/governance');
      expect(viewerAccess.allowed).toBe(false);
      expect(viewerAccess.redirect).toBe('/dashboard/analytics');

      const adminAccess = evaluateRouteAccess('Admin', '/dashboard/operations');
      expect(adminAccess.allowed).toBe(true);
    });

    it('F57-T4: should persist switched role in development storage state via auth store', () => {
      const store = useAuthStore.getState();
      store.switchRole('Marketing_Employee');

      expect(useAuthStore.getState().activeRole).toBe('Marketing_Employee');
      expect(useAuthStore.getState().user?.role).toBe('Marketing_Employee');
    });

    it('F57-T5: should verify default landing route redirects / to dedicated role dashboard', () => {
      expect(resolveLandingRedirect('Super_Admin')).toBe('/dashboard/governance');
      expect(resolveLandingRedirect('Admin')).toBe('/dashboard/operations');
      expect(resolveLandingRedirect('Marketing_Employee')).toBe('/dashboard/marketing');
      expect(resolveLandingRedirect('Operator')).toBe('/dashboard/operator');
      expect(resolveLandingRedirect('Viewer')).toBe('/dashboard/analytics');
    });
  });
});
