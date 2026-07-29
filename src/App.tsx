import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/AppShell";
import OverviewPage from "@/pages/OverviewPage";
import DevicesPage from "@/pages/DevicesPage";
import NetworkMapPage from "@/pages/NetworkMapPage";
import PackagesPage from "@/pages/PackagesPage";
import DeploymentsPage from "@/pages/DeploymentsPage";
import AgentInstallerPage from "@/pages/AgentInstallerPage";
import RemoteCommandsPage from "@/pages/RemoteCommandsPage";
import LogsPage from "@/pages/LogsPage";
import SettingsPage from "@/pages/SettingsPage";
import ReportsPage from "@/pages/ReportsPage";
import GroupsPage from "@/pages/GroupsPage";
import RemoteSqlPage from "@/pages/RemoteSqlPage";
import WorkflowsPage from "@/pages/WorkflowsPage";
import UserManagementPage from "./pages/UserManagementPage";
import RoleManagementPage from "./pages/RoleManagementPage";
import TicketsPage from "./pages/TicketsPage";
import CrmLookupPage from "./pages/CrmLookupPage";
import CrmReportsPage from "./pages/CrmReportsPage";
import CrmAbcAnalysisPage from "./pages/CrmAbcAnalysisPage";
import CrmSyncPage from "./pages/CrmSyncPage";
import CrmDevLoyaltyPage from "./pages/CrmDevLoyaltyPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import ScaleManagerPage from "./pages/ScaleManagerPage";
import EslManagerPage from "./pages/EslManagerPage";
import CCTVMonitoringPage from "./pages/CCTVMonitoringPage";
import PMDashboardPage from "./pages/PMDashboardPage";
import PMSchedulePage from "./pages/PMSchedulePage";
import PMActionItemsPage from "./pages/PMActionItemsPage";
import DeviceHealthPage from "./pages/DeviceHealthPage";
import InstallersPage from "./pages/InstallersPage";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import SSOCallbackPage from "./pages/SSOCallbackPage";
import { Navigate } from "react-router-dom";
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const savedUser = localStorage.getItem("pepi_user");
  if (savedUser) {
    try {
      const user = JSON.parse(savedUser);
      if (user && user.sessionId) {
        init = init || {};
        init.headers = init.headers || {};
        if (init.headers instanceof Headers) {
          init.headers.set('x-session-id', user.sessionId);
        } else if (Array.isArray(init.headers)) {
          init.headers.push(['x-session-id', user.sessionId]);
        } else {
          (init.headers as Record<string, string>)['x-session-id'] = user.sessionId;
        }
      }
    } catch (e) {
      console.error('[FETCH_OVERRIDE] Error parsing pepi_user:', e);
    }
  }

  const response = await originalFetch(input, init);

  if (response.status === 401) {
    console.warn('[FETCH_OVERRIDE] Received 401 Unauthorized, logging out user.');
    localStorage.removeItem("pepi_user");
    if (!window.location.pathname.endsWith('/login') && !window.location.pathname.endsWith('/sso-callback')) {
      window.location.href = '/login';
    }
  }

  return response;
};

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/sso-callback" element={<SSOCallbackPage />} />
            
            <Route path="/" element={
              <ProtectedRoute>
                <AppShell>
                  <OverviewPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute>
                <AppShell>
                  <ReportsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/activities" element={
              <ProtectedRoute>
                <AppShell>
                  <ActivitiesPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/tickets" element={
              <ProtectedRoute>
                <AppShell>
                  <TicketsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/devices" element={
              <ProtectedRoute>
                <AppShell>
                  <DevicesPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/network" element={
              <ProtectedRoute>
                <AppShell>
                  <NetworkMapPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/packages" element={
              <ProtectedRoute>
                <AppShell>
                  <PackagesPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/deploy" element={
              <ProtectedRoute>
                <AppShell>
                  <DeploymentsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/groups" element={
              <ProtectedRoute>
                <AppShell>
                  <GroupsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/agent-installer" element={
              <ProtectedRoute>
                <AppShell>
                  <AgentInstallerPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/remote" element={
              <ProtectedRoute>
                <AppShell>
                  <RemoteCommandsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/remote-sql" element={
              <ProtectedRoute>
                <AppShell>
                  <RemoteSqlPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/workflows" element={
              <ProtectedRoute>
                <AppShell>
                  <WorkflowsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/users" element={
              <ProtectedRoute>
                <AppShell>
                  <UserManagementPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/roles" element={
              <ProtectedRoute>
                <AppShell>
                  <RoleManagementPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/logs" element={
              <ProtectedRoute>
                <AppShell>
                  <LogsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            {/* CRM Center */}
            <Route path="/crm/lookup" element={<ProtectedRoute><AppShell><CrmLookupPage /></AppShell></ProtectedRoute>} />
            <Route path="/crm/sync" element={<ProtectedRoute><AppShell><CrmSyncPage /></AppShell></ProtectedRoute>} />
            <Route path="/crm/abc-analysis" element={<ProtectedRoute><AppShell><CrmAbcAnalysisPage /></AppShell></ProtectedRoute>} />
            <Route path="/crm/reports/:type" element={<ProtectedRoute><AppShell><CrmReportsPage /></AppShell></ProtectedRoute>} />
            <Route path="/crm/dev-loyalty" element={<ProtectedRoute><AppShell><CrmDevLoyaltyPage /></AppShell></ProtectedRoute>} />
            <Route path="/scales" element={
              <ProtectedRoute>
                <AppShell>
                  <ScaleManagerPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/esl" element={
              <ProtectedRoute>
                <AppShell>
                  <EslManagerPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/tools/installers" element={
              <ProtectedRoute>
                <AppShell>
                  <InstallersPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/cctv" element={
              <ProtectedRoute>
                <AppShell>
                  <CCTVMonitoringPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/support-manager/dashboard" element={
              <ProtectedRoute>
                <AppShell>
                  <PMDashboardPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/support-manager/schedule" element={
              <ProtectedRoute>
                <AppShell>
                  <PMSchedulePage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/support-manager/action-items" element={
              <ProtectedRoute>
                <AppShell>
                  <PMActionItemsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/support-manager/device-health" element={
              <ProtectedRoute>
                <AppShell>
                  <DeviceHealthPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <AppShell>
                  <SettingsPage />
                </AppShell>
              </ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
