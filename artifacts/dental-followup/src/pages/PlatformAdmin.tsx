import { Route, Switch, useLocation } from "wouter";
import PlatformAdminLayout from "./platform-admin/PlatformAdminLayout";
import Overview from "./platform-admin/Overview";
import Customers from "./platform-admin/Customers";
import Trials from "./platform-admin/Trials";
import ActivationRequests from "./platform-admin/ActivationRequests";
import Errors from "./platform-admin/Errors";
import Health from "./platform-admin/Health";
import Audit from "./platform-admin/Audit";
import Settings from "./platform-admin/Settings";
import LandingContent from "./platform-admin/LandingContent";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function PlatformAdmin() {
  const { isPlatformAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isPlatformAdmin) {
      setLocation("/dashboard");
    }
  }, [isPlatformAdmin, setLocation]);

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <PlatformAdminLayout>
      <Switch>
        <Route path="/platform-admin" component={Overview} />
        <Route path="/platform-admin/customers/:id" component={Customers} />
        <Route path="/platform-admin/customers" component={Customers} />
        <Route path="/platform-admin/trials" component={Trials} />
        <Route path="/platform-admin/activation-requests" component={ActivationRequests} />
        <Route path="/platform-admin/errors" component={Errors} />
        <Route path="/platform-admin/health" component={Health} />
        <Route path="/platform-admin/audit" component={Audit} />
        <Route path="/platform-admin/settings" component={Settings} />
        <Route path="/platform-admin/landing" component={LandingContent} />
      </Switch>
    </PlatformAdminLayout>
  );
}
