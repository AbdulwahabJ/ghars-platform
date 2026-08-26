import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  usePlatformTenants,
  usePlatformTenant,
  usePlatformActivateTenant,
  usePlatformSuspendTenant,
  usePlatformReactivateTenant,
  usePlatformExtendTrial,
  usePlatformResolveActivationRequest,
  usePlatformResetTenantAdminPassword,
} from "@/hooks/use-platform-admin";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, CheckCircle2, ShieldAlert, Loader2, FileText, Settings2, ShieldCheck, Calendar, Copy, KeyRound, LogOut, MapPin, Phone } from "lucide-react";
import { TenantStatus } from "@workspace/shared";
import { formatSaudiDate, formatSaudiDateTime } from "@/lib/datetime";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/LocaleProvider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { localizeErrorMessage } from "@/lib/localize-error";

export default function PlatformAdmin() {
  const [, setLocation] = useLocation();
  const { isPlatformAdmin, logout } = useAuth();
  const { t } = useTranslation("commercial");
  const { direction } = useLocale();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 500);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: listData, isLoading: listLoading } = usePlatformTenants({
    query: debouncedQuery || undefined,
    status: status !== "all" ? (status as TenantStatus) : undefined,
    page: 1,
    limit: 50,
  });

  React.useEffect(() => {
    if (!isPlatformAdmin) {
      setLocation("/");
    }
  }, [isPlatformAdmin, setLocation]);

  if (!isPlatformAdmin) {
    return null;
  }

  const handleLogout = () =>
    logout.mutate(undefined, { onSuccess: () => setLocation("/login") });

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#f4f7fa] pb-12" dir={direction}>
      <header className="bg-brand-navy text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={handleLogout} className="gap-2 text-white hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" />
              <span>{t("common:actions.logout")}</span>
            </Button>
            <div className="flex items-center gap-3 border-s border-white/20 ps-4">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
              <h1 className="text-lg font-bold tracking-wide">{t("platformAdmin.title")}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedTenantId ? (
          <div className="space-y-6 animate-in fade-in duration-300">

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={t("platformAdmin.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="ps-9 h-11 bg-slate-50 border-slate-200 focus-visible:bg-white"
                />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full sm:w-48 h-11 bg-slate-50 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("platformAdmin.allStatuses")}</SelectItem>
                  <SelectItem value="PENDING_VERIFICATION">{t("statuses.PENDING_VERIFICATION")}</SelectItem>
                  <SelectItem value="TRIAL">{t("statuses.TRIAL")}</SelectItem>
                  <SelectItem value="ACTIVE">{t("statuses.ACTIVE")}</SelectItem>
                  <SelectItem value="SUSPENDED">{t("statuses.SUSPENDED")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="w-[120px] font-medium text-slate-500">{t("platformAdmin.columns.ref")}</TableHead>
                      <TableHead className="font-medium text-slate-500">{t("platformAdmin.columns.clinic")}</TableHead>
                      <TableHead className="font-medium text-slate-500">{t("platformAdmin.columns.status")}</TableHead>
                      <TableHead className="text-center font-medium text-slate-500">{t("platformAdmin.columns.users")}</TableHead>
                      <TableHead className="text-center font-medium text-slate-500">{t("platformAdmin.columns.requests")}</TableHead>
                      <TableHead className="text-end font-medium text-slate-500">{t("platformAdmin.columns.registered")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <Loader2 className="h-6 w-6 animate-spin text-slate-300 mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : listData?.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                          {t("platformAdmin.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      listData?.items.map((tenant) => (
                        <TableRow
                          key={tenant.id}
                          className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                          onClick={() => setSelectedTenantId(tenant.id)}
                        >
                          <TableCell className="font-mono text-xs text-slate-500">{tenant.referenceCode}</TableCell>
                          <TableCell>
                            <div className="font-medium text-brand-navy">{tenant.name}</div>
                            {tenant.contactEmail && (
                              <div className="text-xs text-slate-500 mt-0.5">{tenant.contactEmail}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={tenant.status} />
                          </TableCell>
                          <TableCell className="text-center text-slate-600">{tenant.userCount}</TableCell>
                          <TableCell className="text-center">
                            {tenant.activationRequestCount > 0 ? (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">
                                {tenant.activationRequestCount}
                              </Badge>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-end text-sm text-slate-500 notranslate">
                            {formatSaudiDate(tenant.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : (
          <TenantDetail
            id={selectedTenantId}
            onBack={() => setSelectedTenantId(null)}
          />
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation("commercial");
  switch (status) {
    case 'ACTIVE': return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-none">{t("statuses.ACTIVE")}</Badge>;
    case 'SUSPENDED': return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-none">{t("statuses.SUSPENDED")}</Badge>;
    case 'TRIAL': return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none">{t("statuses.TRIAL")}</Badge>;
    default: return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none">{t("statuses.PENDING_VERIFICATION")}</Badge>;
  }
}

function TenantDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: detailData, isLoading } = usePlatformTenant(id);
  const { t } = useTranslation(["commercial", "common"]);

  const activateMutation = usePlatformActivateTenant();
  const suspendMutation = usePlatformSuspendTenant();
  const reactivateMutation = usePlatformReactivateTenant();
  const extendTrialMutation = usePlatformExtendTrial();
  const resolveRequestMutation = usePlatformResolveActivationRequest();
  const resetPasswordMutation = usePlatformResetTenantAdminPassword();

  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [extendDays, setExtendDays] = useState("14");

  const [resolveDialogOpen, setResolveDialogOpen] = useState<{id: string, action: 'approve'|'reject'} | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resetUser, setResetUser] = useState<{ id: string; fullName: string } | null>(null);
  const [manualPassword, setManualPassword] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  if (isLoading || !detailData) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tenant = detailData.tenant;

  const handleExtend = () => {
    extendTrialMutation.mutate({ id, input: { days: parseInt(extendDays) } }, {
      onSuccess: () => setExtendDialogOpen(false)
    });
  };

  const handleResolve = () => {
    if (!resolveDialogOpen) return;
    resolveRequestMutation.mutate({
      tenantId: id,
      id: resolveDialogOpen.id,
      action: resolveDialogOpen.action,
      input: { note: resolveNote || undefined }
    }, {
      onSuccess: () => setResolveDialogOpen(null)
    });
  };

  const handlePasswordReset = () => {
    if (!resetUser) return;
    resetPasswordMutation.mutate({
      tenantId: id,
      userId: resetUser.id,
      input: manualPassword.trim() ? { password: manualPassword } : {},
    }, {
      onSuccess: (result) => setTemporaryPassword(result.temporaryPassword),
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={onBack} className="h-9 gap-2 text-slate-600">
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          {t("platformAdmin.back")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column - Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-brand-navy">{tenant.name}</h2>
                  <StatusBadge status={tenant.status} />
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-600">Ref: {tenant.referenceCode}</span>
                  {tenant.legalName && <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {tenant.legalName}</span>}
                </div>
              </div>
            </div>

            <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-8">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t("platformAdmin.contactName")}</label>
                <div className="text-[15px] font-medium">{tenant.contactName || '—'}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t("platformAdmin.contactEmail")}</label>
                <div className="text-[15px] font-medium">{tenant.contactEmail || '—'}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t("platformAdmin.contactPhone")}</label>
                <div className="flex items-center gap-1.5 text-[15px] font-medium" dir="ltr">
                  <Phone className="h-4 w-4 text-slate-400" />
                  {tenant.contactPhone || '—'}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t("platformAdmin.city")}</label>
                <div className="flex items-center gap-1.5 text-[15px] font-medium">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {tenant.city || '—'}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t("platformAdmin.registrationDate")}</label>
                <div className="text-[15px] font-medium notranslate">{formatSaudiDateTime(tenant.createdAt)}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 block">{t("platformAdmin.trialPeriod")}</label>
                <div className="text-[15px] font-medium">
                  {tenant.trialStartedAt ? (
                    <span className="notranslate">{formatSaudiDate(tenant.trialStartedAt)} → {tenant.trialEndsAt ? formatSaudiDate(tenant.trialEndsAt) : '—'}</span>
                  ) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-brand-navy">{t("platformAdmin.users.title")}</h3>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("platformAdmin.users.name")}</TableHead>
                    <TableHead>{t("platformAdmin.users.username")}</TableHead>
                    <TableHead>{t("platformAdmin.users.role")}</TableHead>
                    <TableHead>{t("platformAdmin.users.status")}</TableHead>
                    <TableHead>{t("platformAdmin.users.lastLogin")}</TableHead>
                    <TableHead>{t("common:labels.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.users.map((tenantUser) => (
                    <TableRow key={tenantUser.id}>
                      <TableCell className="font-medium">{tenantUser.fullName}</TableCell>
                      <TableCell dir="ltr">{tenantUser.username}</TableCell>
                      <TableCell>{t(`common:roles.${tenantUser.role.toLowerCase()}`)}</TableCell>
                      <TableCell>
                        <Badge variant={tenantUser.isActive ? "secondary" : "destructive"}>
                          {tenantUser.isActive ? t("platformAdmin.users.active") : t("platformAdmin.users.disabled")}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {tenantUser.lastLoginAt ? formatSaudiDateTime(tenantUser.lastLoginAt) : "—"}
                      </TableCell>
                      <TableCell>
                        {tenantUser.role === "ADMIN" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => {
                              setResetUser({ id: tenantUser.id, fullName: tenantUser.fullName });
                              setManualPassword("");
                              setTemporaryPassword("");
                              resetPasswordMutation.reset();
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                            {t("platformAdmin.actions.resetPassword")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Activation Requests */}
          {tenant.activationRequests.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                <h3 className="font-bold text-brand-navy flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-500" />
                  {t("platformAdmin.activationRequests")}
                </h3>
              </div>
              <div className="divide-y divide-slate-100">
                {tenant.activationRequests.map(req => (
                  <div key={req.id} className="p-5 flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                          req.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                          req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {req.status}
                        </span>
                        <span className="text-xs text-slate-400 notranslate">{formatSaudiDateTime(req.createdAt)}</span>
                      </div>
                      {req.note && <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 mt-2">{req.note}</p>}
                    </div>
                    {req.status === 'PENDING' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => setResolveDialogOpen({id: req.id, action: 'approve'})}>
                          {t("platformAdmin.actions.approveRequest")}
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setResolveDialogOpen({id: req.id, action: 'reject'})}>
                          {t("platformAdmin.actions.rejectRequest")}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-brand-navy flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-slate-400" />
                {t("platformAdmin.lifecycleActions")}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              {tenant.status === 'TRIAL' || tenant.status === 'PENDING_VERIFICATION' ? (
                <Button
                  className="w-full justify-start bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 shadow-none"
                  onClick={() => activateMutation.mutate(id)}
                  disabled={activateMutation.isPending}
                >
                  <CheckCircle2 className="me-2 h-4 w-4" />
                  {t("platformAdmin.actions.activate")}
                </Button>
              ) : null}

              {tenant.status === 'SUSPENDED' ? (
                <Button
                  className="w-full justify-start bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 shadow-none"
                  onClick={() => reactivateMutation.mutate(id)}
                  disabled={reactivateMutation.isPending}
                >
                  <CheckCircle2 className="me-2 h-4 w-4" />
                  {t("platformAdmin.actions.reactivate")}
                </Button>
              ) : null}

              {tenant.status === 'ACTIVE' || tenant.status === 'TRIAL' ? (
                <Button
                  variant="outline"
                  className="w-full justify-start text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => suspendMutation.mutate(id)}
                  disabled={suspendMutation.isPending}
                >
                  <ShieldAlert className="me-2 h-4 w-4" />
                  {t("platformAdmin.actions.suspend")}
                </Button>
              ) : null}

              <Button
                variant="outline"
                className="w-full justify-start text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => setExtendDialogOpen(true)}
              >
                <Calendar className="me-2 h-4 w-4" />
                {t("platformAdmin.actions.extendTrial")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platformAdmin.dialogs.extendTrialTitle")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium mb-2">{t("platformAdmin.dialogs.days")}</label>
            <Input type="number" value={extendDays} onChange={e => setExtendDays(e.target.value)} min="1" max="90" dir="ltr" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>{t("platformAdmin.dialogs.cancel")}</Button>
            <Button onClick={handleExtend} disabled={extendTrialMutation.isPending} className="btn-primary">
              {extendTrialMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("platformAdmin.actions.extendTrial")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolveDialogOpen} onOpenChange={(open) => !open && setResolveDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platformAdmin.dialogs.resolveRequestTitle")}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium mb-2">{t("platformAdmin.dialogs.note")}</label>
            <Textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} rows={4} className="resize-none" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(null)}>{t("platformAdmin.dialogs.cancel")}</Button>
            <Button
              onClick={handleResolve}
              disabled={resolveRequestMutation.isPending}
              className={resolveDialogOpen?.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {resolveRequestMutation.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {resolveDialogOpen?.action === 'approve' ? t("platformAdmin.dialogs.approve") : t("platformAdmin.dialogs.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetUser} onOpenChange={(open) => {
        if (!open) {
          setResetUser(null);
          setManualPassword("");
          setTemporaryPassword("");
          resetPasswordMutation.reset();
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platformAdmin.dialogs.resetPasswordTitle", { name: resetUser?.fullName })}</DialogTitle>
          </DialogHeader>
          {resetPasswordMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{localizeErrorMessage(resetPasswordMutation.error)}</AlertDescription>
            </Alert>
          )}
          {temporaryPassword ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t("platformAdmin.dialogs.temporaryPasswordNotice")}</p>
              <div className="flex items-center gap-2 rounded-lg border bg-slate-50 p-3">
                <code dir="ltr" className="flex-1 select-all text-start font-mono text-sm">{temporaryPassword}</code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void navigator.clipboard.writeText(temporaryPassword)}
                  aria-label={t("platformAdmin.dialogs.copyPassword")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-600">{t("platformAdmin.dialogs.resetPasswordDescription")}</p>
              <div className="space-y-2">
                <label className="block text-sm font-medium">{t("platformAdmin.dialogs.temporaryPassword")}</label>
                <Input
                  type="password"
                  dir="ltr"
                  value={manualPassword}
                  onChange={(event) => setManualPassword(event.target.value)}
                />
                <p className="text-xs text-slate-500">{t("platformAdmin.dialogs.generateHint")}</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetUser(null)}>{t("platformAdmin.dialogs.cancel")}</Button>
                <Button onClick={handlePasswordReset} disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                  {t("platformAdmin.actions.resetPassword")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
