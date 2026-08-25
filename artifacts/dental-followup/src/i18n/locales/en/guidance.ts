const guidance = {
  tour: {
    done: "Start working", next: "Next", previous: "Previous", progress: "{{current}} of 6",
    navigationTitle: "Main navigation", navigationDescription: "Use these tabs to move between the dashboard, patients, and financial reports.",
    searchTitle: "Find a patient", searchDescription: "Search by patient name, file number, or mobile number.",
    newPatientTitle: "Add a new case", newPatientDescription: "Start here to register a new patient or add an implant case to an existing patient.",
    overviewTitle: "Daily work summary", overviewDescription: "These cards show appointments, follow-ups, and ready or overdue cases.",
    workspaceTitle: "Patient record", workspaceDescription: "The patient record includes details, implants, payments, follow-up, and a summary.",
    helpTitle: "Help and support", helpDescription: "You can restart the product tour at any time from the question-mark icon.",
    completeTitle: "Tour complete", completeDescription: "You are ready to use the system. You can restart the tour anytime from the question-mark icon.",
    welcomeTitle: "Welcome to the dental implant follow-up system", welcomeDescription: "Take a short tour to learn the system’s most important areas.", welcomeDuration: "The tour takes less than a minute and can be started later from the question-mark icon.",
    start: "Start tour", skip: "Skip for now",
  },
  quickHelp: {
    title: "Quick help", addPatient: "To add a patient:", addPatientText: "Select Register new implant case.",
    addCase: "To add a case:", addCaseText: "Select Register new implant case.", addImplant: "To add an implant:", addImplantText: "Open the patient record, then the Implants tab.",
    search: "To find a patient:", searchText: "Use the name, file number, or mobile number.", openPatient: "To open a patient record:", openPatientText: "Select the patient row in the patient list or search results.",
    editPatient: "To edit patient details:", editPatientText: "Open the patient record, edit the fields, then select Save changes.",
    archivePatient: "To archive or restore a record:", archivePatientText: "Use the Details tab in the patient record.",
    restartTour: "To restart the product tour:", restartTourText: "Use the question-mark icon at the top of the screen.",
  },
  shortcuts: { title: "Abbreviation guide", system: "Implant system", site: "Tooth or site number", size: "Implant size", preserved: "Value preserved from the original record", graft: "Bone graft information as entered by the user", pros: "Prosthetic duration or stage", direct: "Direct procedure", immediate: "Immediate procedure" },
  dashboard: {
    openPatient: "Open record", todayAppointments: "Review appointments", noTodayAppointments: "No follow-up appointments today.", overdueFollowups: "Overdue follow-ups", noOverdueFollowups: "No overdue follow-ups.",
    casesPatients: "Cases ({{count}} patients)", addRecord: "Add record", searchOperational: "Search by patient name, file number, or mobile number...", searchOperationalLabel: "Search the operational report", clearSearch: "Clear search",
    operationalReport: "Operational report ({{count}})", exportCsv: "Export CSV", print: "Print", reportLoadError: "Unable to load the operational report. Try refreshing the page.", noFilteredCases: "No cases match the selected filters.",
    patient: "Patient", fileNumber: "File number", caseStatus: "Case status", treatingDoctor: "Treating doctor", procedureDate: "Procedure date", implants: "Implants", systems: "Systems", nextFollowup: "Next follow-up", remaining: "Remaining", paymentStatus: "Payment status", overdue: "Overdue", readyForProsthesis: "Ready for prosthesis",
    statisticsLoadError: "Unable to load statistics. Try refreshing the page.", noPeriodData: "No data for the selected period.", overTime: "Cases and implants over time ({{grouping}})", daily: "daily", monthly: "monthly", cases: "Cases", implantSystems: "Implant systems distribution", caseStatuses: "Case status distribution", count: "Count", implantStatuses: "Implant status distribution", noPeriodImplants: "No implants for the selected period.", followupOutcomes: "Follow-up outcomes", noPeriodFollowupOutcomes: "No follow-up outcomes for the selected period.", failuresAndRedo: "Failures and reimplantation", failedImplants: "Failed implants", needsRedoImplants: "Implants needing redo", reimplantationCases: "Reimplantation cases",
    chooseDate: "Choose date", today: "Today", clear: "Clear", chooseTime: "Choose time", clearTime: "Clear time", time: "Time", dateTime: "Date and time", am: "AM", pm: "PM",
    updateImplantStatusFailed: "Unable to update the implant status.", updateFailed: "Unable to save the update.", saveFailed: "Unable to save.", updateFollowupFailed: "Unable to update the follow-up.", updatePaymentFailed: "Unable to update the payment.", voidPaymentFailed: "Unable to void the payment.", archiveImplantFailed: "Unable to remove the implant.", archiveProstheticFailed: "Unable to archive the prosthetic record.", archiveAdjunctProcedureFailed: "Unable to archive the adjunct procedure record.", archivePatientFailed: "Unable to remove the row.", unexpectedError: "An unexpected error occurred. Please try again.", protectedStatusTitle: "You cannot revert from a documented prosthetic status.", protectedStatusDescription: "Correct or archive the prosthetic record from its documentation flow first, then edit the implant status.", installmentAmountInvalid: "Enter an amount that does not exceed the installment balance.",
  },
} as const;
export default guidance;