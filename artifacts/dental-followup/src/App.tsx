import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Redirect, Route, Switch, Router as WouterRouter } from 'wouter';

import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import Setup from '@/pages/Setup';
import PatientsList from '@/pages/PatientsList';
import PatientFile from '@/pages/PatientFile';
import Statistics from '@/pages/Statistics';
import Settings from '@/pages/Settings';
import NotFound from '@/pages/not-found';
import { LocaleProvider } from '@/i18n/LocaleProvider';

const queryClient = new QueryClient();

function FinanceRedirect() {
  return <Redirect to="/statistics" replace />;
}

function RemovedSettingsTabRedirect() {
  return <Redirect to="/settings" replace />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/reset-password" component={Login} />
      <Route path="/setup" component={Setup} />
      <Route path="/patients" component={PatientsList} />
      <Route path="/patients/:id" component={PatientFile} />
      <Route path="/finance" component={FinanceRedirect} />
      <Route path="/statistics" component={Statistics} />
      <Route path="/settings/system" component={RemovedSettingsTabRedirect} />
      <Route path="/settings/templates" component={RemovedSettingsTabRedirect} />
      <Route path="/settings/import" component={RemovedSettingsTabRedirect} />
      <Route path="/settings" component={Settings} />
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
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

export default App;
