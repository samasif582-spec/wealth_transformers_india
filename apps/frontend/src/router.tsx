import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateLayout } from './components/PrivateLayout';
import { LoginPage } from './routes/auth/login';
import { DashboardPage } from './routes/dashboard';
import { ClientsPage } from './routes/clients';
import { ClientImportPage } from './routes/clients/import';
import { ClientDetailPage } from './routes/clients/$clientId';
import { TemplatesPage } from './routes/templates';
import { TemplateDetailPage } from './routes/templates/$templateId';
import { MediaPage } from './routes/media';
import { CampaignsPage } from './routes/campaigns';
import { CampaignCreatePage } from './routes/campaigns/new';
import { CampaignDetailPage } from './routes/campaigns/$campaignId';
import { AnalyticsPage } from './routes/analytics';
import { AutomationPage } from './routes/automation';
import { SettingsPage } from './routes/settings';
import { AuditPage } from './routes/audit';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route element={<PrivateLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/import" element={<ClientImportPage />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:templateId" element={<TemplateDetailPage />} />
        <Route path="/media" element={<MediaPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/campaigns/new" element={<CampaignCreatePage />} />
        <Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
