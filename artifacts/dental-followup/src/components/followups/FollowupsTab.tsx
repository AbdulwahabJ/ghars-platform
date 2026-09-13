import { useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  History,
  Loader2,
  MessageCircle,
  MoreVertical,
  PhoneCall,
} from "lucide-react";
import type { Communication, Followup, Patient } from "@workspace/shared";
import { CLOSED_FOLLOWUP_STATUSES, isContactTaskDue } from "@workspace/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useImplantCases } from "@/hooks/use-implant-cases";
import {
  useCommunications,
  useFollowups,
} from "@/hooks/use-followups";
import { formatSaudiDate, formatSaudiDateTime } from "@/lib/datetime";
import { FollowupFormDialog } from "./FollowupFormDialog";
import { OutcomeDialog } from "./OutcomeDialog";
import { PostponeDialog } from "./PostponeDialog";
import { CancelFollowupDialog } from "./CancelFollowupDialog";
import { WhatsAppDialog } from "./WhatsAppDialog";
import { CommunicationResultDialog } from "./CommunicationResultDialog";
import {
  bucketFollowups,
  communicationResultClasses,
  followupStatusClasses,
} from "./followup-utils";
import { useTranslation } from "react-i18next";
import { useEnumTranslation } from "@/i18n/use-enum-translation";

interface FollowupsTabProps {
  patient: Patient;
  focusSection?: boolean;
  targetFollowupId?: string | null;
}

const CLOSED = CLOSED_FOLLOWUP_STATUSES as readonly string[];

export function FollowupsTab({
  patient,
  focusSection = false,
  targetFollowupId = null,
}: FollowupsTabProps) {
  const { t } = useTranslation("operations");
  const { enumLabel } = useEnumTranslation();
  const isArchived = Boolean(patient.archivedAt);
  const { data: casesData } = useImplantCases(patient.id);
  const { data: followups, isLoading } = useFollowups(patient.id);
  const { data: communications, isLoading: communicationsLoading } =
    useCommunications(patient.id);

  const cases = casesData?.items ?? [];
  const activeCases = cases.filter((c) => !c.archivedAt);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Followup | null>(null);
  const [prefillFrom, setPrefillFrom] = useState<Followup | null>(null);
  const [outcomeTarget, setOutcomeTarget] = useState<Followup | null>(null);
  const [postponeTarget, setPostponeTarget] = useState<Followup | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Followup | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappFollowup, setWhatsappFollowup] = useState<Followup | null>(null);
  const [resultTarget, setResultTarget] = useState<Communication | null>(null);
  const [highlightedFollowupId, setHighlightedFollowupId] = useState<string | null>(null);
  const handledDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (!focusSection) {
      handledDeepLinkRef.current = null;
      setHighlightedFollowupId(null);
      return;
    }
    if (isLoading) return;

    const deepLinkKey = targetFollowupId ?? "followups-section";
    if (handledDeepLinkRef.current === deepLinkKey) return;
    handledDeepLinkRef.current = deepLinkKey;

    const frame = window.requestAnimationFrame(() => {
      const target = targetFollowupId
        ? document.getElementById(`followup-${targetFollowupId}`)
        : null;
      const destination = target ?? document.getElementById("patient-followups");
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";

      destination?.scrollIntoView({ behavior, block: "start" });
      if (target) {
        target.focus({ preventScroll: true });
        setHighlightedFollowupId(targetFollowupId);
      }
    });

    const timeout = targetFollowupId
      ? window.setTimeout(() => setHighlightedFollowupId(null), 2000)
      : undefined;

    return () => {
      window.cancelAnimationFrame(frame);
      if (timeout) window.clearTimeout(timeout);
    };
  }, [focusSection, isLoading, targetFollowupId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const all = followups ?? [];
  const buckets = bucketFollowups(all);
  const now = new Date();
  const contactTasks = all.filter((f) => isContactTaskDue(f, now));
  const history = all.filter(
    (f) =>
      CLOSED.includes(f.followupStatus) ||
      ["لم يحضر", "لا يوجد رد", "تحتاج إعادة تواصل"].includes(f.followupStatus),
  );

  const openForm = (edit: Followup | null, prefill: Followup | null) => {
    setEditTarget(edit);
    setPrefillFrom(prefill);
    setFormOpen(true);
  };

  const openWhatsapp = (followup: Followup | null) => {
    setWhatsappFollowup(followup);
    setWhatsappOpen(true);
  };

  return (
    <div className="space-y-6" data-testid="followups-tab">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{t("followups.title")}</h2>
        {!isArchived ? (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => openWhatsapp(buckets.today[0] ?? buckets.upcoming[0] ?? null)}
              variant="outline"
              className="gap-2"
              data-testid="button-whatsapp"
            >
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              <span>{t("followups.whatsapp")}</span>
            </Button>
            <Button
              onClick={() => openForm(null, null)}
              disabled={activeCases.length === 0}
              className="btn-primary gap-2"
              data-testid="button-add-followup"
            >
              <CalendarPlus className="h-4 w-4" />
              <span>{t("followups.add")}</span>
            </Button>
          </div>
        ) : null}
      </div>
      {activeCases.length === 0 && !isArchived ? (
        <p className="text-sm text-muted-foreground">
          {t("followups.addCaseFirst")}
        </p>
      ) : null}

      {/* Overdue */}
      {buckets.overdue.length ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-destructive">
            <AlarmClock className="h-4 w-4" />
            {t("followups.overdue", { count: buckets.overdue.length })}
          </h3>
          {buckets.overdue.map((f) => (
            <FollowupItem
              key={f.id}
              followup={f}
              isTargeted={highlightedFollowupId === f.id}
              isArchived={isArchived}
              onOutcome={setOutcomeTarget}
              onPostpone={setPostponeTarget}
              onCancel={setCancelTarget}
              onEdit={(x) => openForm(x, null)}
              onNewFrom={(x) => openForm(null, x)}
              onWhatsapp={openWhatsapp}
            />
          ))}
        </section>
      ) : null}

      {/* Contact tasks */}
      {contactTasks.length ? (
        <section className="rounded-lg border border-amber-300/60 bg-amber-50 p-4 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <PhoneCall className="h-4 w-4" />
            {t("followups.contactDue", { count: contactTasks.length })}
          </h3>
          {contactTasks.map((f) => (
            <div key={`contact-${f.id}`} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {enumLabel("followupType", f.followupType)}
                {f.contactDueAt ? ` — ${t("followups.due", { date: formatSaudiDate(f.contactDueAt) })}` : null}
              </span>
              {!isArchived ? (
                <Button size="sm" variant="outline" className="gap-1" onClick={() => openWhatsapp(f)}>
                  <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" />
                  <span>{t("followups.whatsappShort")}</span>
                </Button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      {/* Today + upcoming */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <CalendarClock className="h-4 w-4 text-primary" />
          {t("followups.scheduledAppointments")}
        </h3>
        {buckets.today.length === 0 && buckets.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("followups.noScheduled")}</p>
        ) : (
          <>
            {buckets.today.map((f) => (
              <FollowupItem
                key={f.id}
                followup={f}
                isTargeted={highlightedFollowupId === f.id}
                highlight={t("followups.today")}
                isArchived={isArchived}
                onOutcome={setOutcomeTarget}
                onPostpone={setPostponeTarget}
                onCancel={setCancelTarget}
                onEdit={(x) => openForm(x, null)}
                onNewFrom={(x) => openForm(null, x)}
                onWhatsapp={openWhatsapp}
              />
            ))}
            {buckets.upcoming.map((f) => (
              <FollowupItem
                key={f.id}
                followup={f}
                isTargeted={highlightedFollowupId === f.id}
                isArchived={isArchived}
                onOutcome={setOutcomeTarget}
                onPostpone={setPostponeTarget}
                onCancel={setCancelTarget}
                onEdit={(x) => openForm(x, null)}
                onNewFrom={(x) => openForm(null, x)}
                onWhatsapp={openWhatsapp}
              />
            ))}
          </>
        )}
      </section>

      {/* History */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <History className="h-4 w-4 text-muted-foreground" />
          {t("followups.history")}
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("followups.noHistory")}</p>
        ) : (
          history.map((f) => (
            <FollowupItem
              key={f.id}
              followup={f}
              isTargeted={highlightedFollowupId === f.id}
              isArchived={isArchived}
              onOutcome={setOutcomeTarget}
              onPostpone={setPostponeTarget}
              onCancel={setCancelTarget}
              onEdit={(x) => openForm(x, null)}
              onNewFrom={(x) => openForm(null, x)}
              onWhatsapp={openWhatsapp}
            />
          ))
        )}
      </section>

      {/* Communications timeline */}
      <section className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          {t("followups.communications")}
        </h3>
        {communicationsLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (communications ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("followups.noCommunications")}</p>
        ) : (
          (communications ?? []).map((c) => (
            <div
              key={c.id}
              className="rounded-md border border-border/70 p-3 space-y-1.5"
              data-testid={`communication-${c.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>
                    {enumLabel("communicationReason", c.communicationReason) || "—"}
                  </span>
                  {c.templateName ? (
                    <span className="text-xs text-muted-foreground">
                      ({t("followups.template")}: {c.templateName})
                    </span>
                  ) : null}
                </div>
                <Badge variant="outline" className={communicationResultClasses(c.communicationResult)}>
                  {enumLabel("communicationResult", c.communicationResult) || "—"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatSaudiDateTime(c.createdAt)}
                {c.userName ? ` — ${c.userName}` : null}
              </p>
              {c.renderedMessage ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                  {c.renderedMessage}
                </p>
              ) : null}
              {c.resultNote ? (
                <p className="text-xs text-muted-foreground">{t("followups.note")}: {c.resultNote}</p>
              ) : null}
              {!isArchived ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setResultTarget(c)}
                  data-testid={`button-communication-result-${c.id}`}
                >
                  {t("followups.recordResult")}
                </Button>
              ) : null}
            </div>
          ))
        )}
      </section>

      {/* Dialogs (remounted per open) */}
      <FollowupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        patientId={patient.id}
        cases={cases}
        followup={editTarget}
        prefillFrom={prefillFrom}
      />
      <OutcomeDialog
        open={Boolean(outcomeTarget)}
        onOpenChange={(v) => !v && setOutcomeTarget(null)}
        patientId={patient.id}
        followup={outcomeTarget}
        title={t("followups.changeStatus")}
        successMessage={t("followups.statusUpdated")}
      />
      <PostponeDialog
        open={Boolean(postponeTarget)}
        onOpenChange={(v) => !v && setPostponeTarget(null)}
        patientId={patient.id}
        followup={postponeTarget}
      />
      <CancelFollowupDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        patientId={patient.id}
        followup={cancelTarget}
      />
      <WhatsAppDialog
        open={whatsappOpen}
        onOpenChange={setWhatsappOpen}
        patient={patient}
        followup={whatsappFollowup}
      />
      <CommunicationResultDialog
        open={Boolean(resultTarget)}
        onOpenChange={(v) => !v && setResultTarget(null)}
        patientId={patient.id}
        communicationId={resultTarget?.id ?? null}
      />
    </div>
  );
}

interface FollowupItemProps {
  followup: Followup;
  highlight?: string;
  isTargeted?: boolean;
  isArchived: boolean;
  onOutcome: (f: Followup) => void;
  onPostpone: (f: Followup) => void;
  onCancel: (f: Followup) => void;
  onEdit: (f: Followup) => void;
  onNewFrom: (f: Followup) => void;
  onWhatsapp: (f: Followup) => void;
}

function FollowupItem({
  followup: f,
  highlight,
  isTargeted = false,
  isArchived,
  onOutcome,
  onPostpone,
  onCancel,
  onEdit,
  onNewFrom,
  onWhatsapp,
}: FollowupItemProps) {
  const { t } = useTranslation("operations");
  const { enumLabel } = useEnumTranslation();
  const isOpen = f.followupStatus === "مجدولة";
  const isClosed = CLOSED.includes(f.followupStatus);
  const canAct = !isArchived && !isClosed;

  return (
    <div
      id={`followup-${f.id}`}
      tabIndex={-1}
      className={`scroll-mt-32 rounded-md border p-3 flex items-start justify-between gap-3 transition-[background-color,border-color,box-shadow] duration-300 ${
        isTargeted
          ? "border-primary/60 bg-primary/10 shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]"
          : "border-border/70"
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50`}
      data-testid={`followup-${f.id}`}
    >
      <div className="space-y-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {enumLabel("followupType", f.followupType)}
          </span>
          <Badge variant="outline" className={followupStatusClasses(f.followupStatus)}>
            <span>{enumLabel("followupStatus", f.followupStatus)}</span>
          </Badge>
          {highlight ? (
            <Badge className="bg-primary text-primary-foreground">{highlight}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {f.scheduledAt ? formatSaudiDateTime(f.scheduledAt) : t("followups.noAppointment")}
          {f.assignedUserName ? ` — ${t("followups.responsible")}: ${f.assignedUserName}` : null}
        </p>
        {f.result ? (
          <p className="text-xs text-muted-foreground">{t("followups.result")}: {f.result}</p>
        ) : null}
        {f.note ? (
          <p className="text-xs text-muted-foreground">{t("followups.note")}: {f.note}</p>
        ) : null}
      </div>
      {!isArchived ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              data-testid={`button-followup-actions-${f.id}`}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canAct ? (
              <>
                <DropdownMenuItem onClick={() => onOutcome(f)} data-testid={`action-status-${f.id}`}>
                  {t("followups.changeStatus")}
                </DropdownMenuItem>
                {isOpen ? (
                  <DropdownMenuItem onClick={() => onPostpone(f)} data-testid={`action-postpone-${f.id}`}>
                    {t("followups.postpone")}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => onEdit(f)} data-testid={`action-edit-${f.id}`}>
                  {t("followups.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onCancel(f)}
                  className="text-destructive focus:text-destructive"
                  data-testid={`action-cancel-${f.id}`}
                >
                  {t("followups.cancelFollowup")}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuItem onClick={() => onNewFrom(f)} data-testid={`action-new-from-${f.id}`}>
              {t("followups.newFrom")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onWhatsapp(f)} data-testid={`action-whatsapp-${f.id}`}>
              {t("followups.whatsapp")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
