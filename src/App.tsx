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
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "@/pages/LoginPage";
import { Navigate } from "react-router-dom";

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
