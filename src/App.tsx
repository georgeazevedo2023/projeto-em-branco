import { Suspense, lazy, Component, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import DashboardLayout from "./components/dashboard/DashboardLayout";

// Lazy load dashboard pages for better initial load performance
const DashboardHome = lazy(() => import("./pages/dashboard/DashboardHome"));
const Instances = lazy(() => import("./pages/dashboard/Instances"));
const InstanceDetails = lazy(() => import("./pages/dashboard/InstanceDetails"));
const GroupDetails = lazy(() => import("./pages/dashboard/GroupDetails"));
const SendToGroup = lazy(() => import("./pages/dashboard/SendToGroup"));
const UsersManagement = lazy(() => import("./pages/dashboard/UsersManagement"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const ScheduledMessages = lazy(() => import("./pages/dashboard/ScheduledMessages"));
const Broadcaster = lazy(() => import("./pages/dashboard/Broadcaster"));
const BroadcastHistoryPage = lazy(() => import("./pages/dashboard/BroadcastHistoryPage"));
const LeadsBroadcaster = lazy(() => import("./pages/dashboard/LeadsBroadcaster"));
const HelpDesk = lazy(() => import("./pages/dashboard/HelpDesk"));
const InboxManagement = lazy(() => import("./pages/dashboard/InboxManagement"));
const InboxUsersManagement = lazy(() => import("./pages/dashboard/InboxUsersManagement"));
const AdminPanel = lazy(() => import("./pages/dashboard/AdminPanel"));
const Intelligence = lazy(() => import("./pages/dashboard/Intelligence"));
const KanbanCRM = lazy(() => import("./pages/dashboard/KanbanCRM"));
const KanbanBoard = lazy(() => import("./pages/dashboard/KanbanBoard"));

const queryClient = new QueryClient();

// Page loading fallback
// Error boundary for lazy-loaded modules (handles stale HMR cache)
class LazyErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any) {
    if (error?.message?.includes('dynamically imported module') || error?.message?.includes('Failed to fetch')) {
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) return <PageLoader />;
    return this.props.children;
  }
}

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[50vh]">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Auth route wrapper (redirect based on role if already logged in)
const AuthRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    // Super admin vai para o dashboard principal, outros vão para o helpdesk
    const target = isSuperAdmin ? "/dashboard" : "/dashboard/helpdesk";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
};

// Admin-only route wrapper
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard/helpdesk" replace />;
  }

  return <>{children}</>;
};

// CRM route wrapper — apenas super_admin e gerente
const CrmRoute = ({ children }: { children: React.ReactNode }) => {
  const { isSuperAdmin, isGerente, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSuperAdmin && !isGerente) {
    return <Navigate to="/dashboard/helpdesk" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route
        path="/login"
        element={
          <AuthRoute>
            <Login />
          </AuthRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminRoute><Suspense fallback={<PageLoader />}><DashboardHome /></Suspense></AdminRoute>} />
        <Route path="broadcast" element={<AdminRoute><Suspense fallback={<PageLoader />}><Broadcaster /></Suspense></AdminRoute>} />
        <Route path="broadcast/history" element={<AdminRoute><Suspense fallback={<PageLoader />}><BroadcastHistoryPage /></Suspense></AdminRoute>} />
        <Route path="broadcast/leads" element={<AdminRoute><Suspense fallback={<PageLoader />}><LeadsBroadcaster /></Suspense></AdminRoute>} />
        <Route path="instances" element={<AdminRoute><Suspense fallback={<PageLoader />}><Instances /></Suspense></AdminRoute>} />
        <Route path="instances/:id" element={<AdminRoute><Suspense fallback={<PageLoader />}><InstanceDetails /></Suspense></AdminRoute>} />
        <Route path="instances/:instanceId/groups/:groupId" element={<AdminRoute><Suspense fallback={<PageLoader />}><GroupDetails /></Suspense></AdminRoute>} />
        <Route path="instances/:instanceId/groups/:groupId/send" element={<AdminRoute><Suspense fallback={<PageLoader />}><SendToGroup /></Suspense></AdminRoute>} />
        <Route path="users" element={<AdminRoute><Suspense fallback={<PageLoader />}><UsersManagement /></Suspense></AdminRoute>} />
        <Route path="settings" element={<AdminRoute><Suspense fallback={<PageLoader />}><Settings /></Suspense></AdminRoute>} />
        <Route path="scheduled" element={<AdminRoute><Suspense fallback={<PageLoader />}><ScheduledMessages /></Suspense></AdminRoute>} />
        <Route path="helpdesk" element={<LazyErrorBoundary><Suspense fallback={<PageLoader />}><HelpDesk /></Suspense></LazyErrorBoundary>} />
        <Route path="inboxes" element={<AdminRoute><LazyErrorBoundary><Suspense fallback={<PageLoader />}><InboxManagement /></Suspense></LazyErrorBoundary></AdminRoute>} />
        <Route path="inbox-users" element={<AdminRoute><LazyErrorBoundary><Suspense fallback={<PageLoader />}><InboxUsersManagement /></Suspense></LazyErrorBoundary></AdminRoute>} />
        <Route path="admin" element={<AdminRoute><LazyErrorBoundary><Suspense fallback={<PageLoader />}><AdminPanel /></Suspense></LazyErrorBoundary></AdminRoute>} />
        <Route path="intelligence" element={<AdminRoute><LazyErrorBoundary><Suspense fallback={<PageLoader />}><Intelligence /></Suspense></LazyErrorBoundary></AdminRoute>} />
        <Route path="crm" element={<CrmRoute><LazyErrorBoundary><Suspense fallback={<PageLoader />}><KanbanCRM /></Suspense></LazyErrorBoundary></CrmRoute>} />
        <Route path="crm/:boardId" element={<CrmRoute><LazyErrorBoundary><Suspense fallback={<PageLoader />}><KanbanBoard /></Suspense></LazyErrorBoundary></CrmRoute>} />
        {/* Redirect legacy/bookmarked URLs */}
        <Route path="leads-broadcast" element={<Navigate to="/dashboard/broadcast/leads" replace />} />
        <Route path="users" element={<Navigate to="/dashboard/admin" replace />} />
        <Route path="inboxes" element={<Navigate to="/dashboard/admin" replace />} />
        <Route path="inbox-users" element={<Navigate to="/dashboard/admin" replace />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
