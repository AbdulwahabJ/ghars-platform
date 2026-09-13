export type PatientFileTab = "summary" | "procedures";
export type PatientFileSection = "followups";

interface PatientPathOptions {
  tab?: PatientFileTab;
  section?: PatientFileSection;
  followupId?: string | null;
}

export interface PatientDeepLinkState {
  tab: PatientFileTab;
  section: PatientFileSection | null;
  followupId: string | null;
}

export function buildPatientPath(
  patientId: string,
  options: PatientPathOptions = {},
): string {
  const params = new URLSearchParams();

  if (options.tab) params.set("tab", options.tab);
  if (options.section) params.set("section", options.section);
  if (options.followupId) params.set("followupId", options.followupId);

  const query = params.toString();
  return `/patients/${encodeURIComponent(patientId)}${query ? `?${query}` : ""}`;
}

export function buildPatientFollowupsPath(
  patientId: string,
  followupId?: string | null,
): string {
  return buildPatientPath(patientId, {
    tab: "procedures",
    section: "followups",
    followupId,
  });
}

export function parsePatientDeepLink(search: string): PatientDeepLinkState {
  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const requestedSection = params.get("section");
  const legacyFollowupTab = requestedTab === "followup";
  const section = requestedSection === "followups" || legacyFollowupTab
    ? "followups"
    : null;

  return {
    tab: requestedTab === "procedures" || legacyFollowupTab
      ? "procedures"
      : "summary",
    section,
    followupId: section ? params.get("followupId") : null,
  };
}