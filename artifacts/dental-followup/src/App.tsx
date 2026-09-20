import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const VerifyEmail = lazy(() => import('@/pages/VerifyEmail'));
const AccessStatus = lazy(() => import('@/pages/AccessStatus'));
const PlatformAdmin = lazy(() => import('@/pages/PlatformAdmin'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const Setup = lazy(() => import('@/pages/Setup'));
const PatientsList = lazy(() => import('@/pages/PatientsList'));
const PatientFile = lazy(() => import('@/pages/PatientFile'));
const Statistics = lazy(() => import('@/pages/Statistics'));
const Settings = lazy(() => import('@/pages/Settings'));
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const Terms = lazy(() => import('@/pages/legal/Terms'));
const Privacy = lazy(() => import('@/pages/legal/Privacy'));
const NotFound = lazy(() => import('@/pages/not-found'));
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { ImpersonationLifecycleHandler } from '@/components/ImpersonationLifecycleHandler';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { Loader2 } from 'lucide-react';
import { clearChunkRecoveryAttempt } from '@/lib/runtime-errors';

const queryClient = new QueryClient();

function FinanceRedirect() {
  return <Redirect to="/statistics" replace />;
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function RouteRecoveryMarker() {
  const [location] = useLocation();

  useEffect(() => {
    clearChunkRecoveryAttempt(location);
  }, [location]);

  return null;
}

function ProtectedRoute({ component: Component, path }: { component: any; path: string }) {
  const { user, currentTenant, isPlatformAdmin, impersonation, isLoading } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" replace />;
  }

  // A support session must never be able to access platform-admin screens,
  // even if the impersonated user's account retains the platform-admin flag.
  if (impersonation && path.startsWith("/platform-admin")) {
    return <Redirect to="/dashboard" replace />;
  }

  if (user.mustChangePassword && path !== "/change-password") {
    return <Redirect to="/change-password" replace />;
  }
  if (!user.mustChangePassword && path === "/change-password") {
    return <Component />;
  }

  if (
    isPlatformAdmin &&
    !currentTenant &&
    path !== "/platform-admin" &&
    path !== "/change-password"
  ) {
    return <Redirect to="/platform-admin" replace />;
  }

  if (currentTenant) {
    const isPending = currentTenant.status === "PENDING_VERIFICATION";
    const isSuspended = currentTenant.status === "SUSPENDED";
    const trialEndsAt = currentTenant.trialEndsAt
      ? new Date(currentTenant.trialEndsAt).getTime()
      : Number.NaN;
    const isTrialExpired =
      currentTenant.status === "TRIAL" &&
      (!currentTenant.trialEndsAt || !Number.isFinite(trialEndsAt) || trialEndsAt <= now);

    const isBlocked = isPending || isSuspended || isTrialExpired;

    if (isBlocked) {
      if (isPlatformAdmin) {
        if (path !== "/platform-admin") {
          return <Redirect to="/platform-admin" replace />;
        }
      } else if (path !== "/access-status") {
        return <Redirect to="/access-status" replace />;
      }
    }

    if (!isBlocked && path === "/access-status") {
      return <Redirect to="/dashboard" replace />;
    }
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/setup" component={Setup} />

      <Route path="/access-status">
        {() => <ProtectedRoute component={AccessStatus} path="/access-status" />}
      </Route>
      <Route path="/platform-admin">
        {() => <ProtectedRoute component={PlatformAdmin} path="/platform-admin" />}
      </Route>
      <Route path="/platform-admin/*">
        {() => <ProtectedRoute component={PlatformAdmin} path="/platform-admin" />}
      </Route>
      <Route path="/change-password">
        {() => <ProtectedRoute component={ChangePassword} path="/change-password" />}
      </Route>
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} path="/dashboard" />}
      </Route>
      <Route path="/">
        {() => <LandingPage />}
      </Route>
      <Route path="/privacy">
        {() => <Privacy />}
      </Route>
      <Route path="/terms">
        {() => <Terms />}
      </Route>
      <Route path="/patients">
        {() => <ProtectedRoute component={PatientsList} path="/patients" />}
      </Route>
      <Route path="/patients/:id">
        {() => <ProtectedRoute component={PatientFile} path="/patients/:id" />}
      </Route>
      <Route path="/finance" component={FinanceRedirect} />
      <Route path="/statistics">
        {() => <ProtectedRoute component={Statistics} path="/statistics" />}
      </Route>
      <Route path="/settings/system">
        <Redirect to="/settings?tab=lookups" replace />
      </Route>
      <Route path="/settings/templates">
        <Redirect to="/settings?tab=users" replace />
      </Route>
      <Route path="/settings/import">
        <Redirect to="/settings?tab=import" replace />
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} path="/settings" />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <ImpersonationLifecycleHandler />
            <RouteErrorBoundary onRetry={() => queryClient.resetQueries()}>
              <Suspense fallback={<RouteLoading />}>
                <Router />
                <RouteRecoveryMarker />
              </Suspense>
            </RouteErrorBoundary>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

export default App;
