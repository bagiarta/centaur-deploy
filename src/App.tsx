import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppShell from "@/components/AppShell";
import OverviewPage from "@/pages/OverviewPage";
import DevicesPage from "@/pages/DevicesPage";
import PackagesPage from "@/pages/PackagesPage";
import DeploymentsPage from "@/pages/DeploymentsPage";
import AgentInstallerPage from "@/pages/AgentInstallerPage";
import RemoteCommandsPage from "@/pages/RemoteCommandsPage";
import LogsPage from "@/pages/LogsPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <AppShell>
              <OverviewPage />
            </AppShell>
          } />
          <Route path="/devices" element={
            <AppShell>
              <DevicesPage />
            </AppShell>
          } />
          <Route path="/packages" element={
            <AppShell>
              <PackagesPage />
            </AppShell>
          } />
          <Route path="/deploy" element={
            <AppShell>
              <DeploymentsPage />
            </AppShell>
          } />
          <Route path="/agent-installer" element={
            <AppShell>
              <AgentInstallerPage />
            </AppShell>
          } />
          <Route path="/remote" element={
            <AppShell>
              <RemoteCommandsPage />
            </AppShell>
          } />
          <Route path="/logs" element={
            <AppShell>
              <LogsPage />
            </AppShell>
          } />
          <Route path="/settings" element={
            <AppShell>
              <SettingsPage />
            </AppShell>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
