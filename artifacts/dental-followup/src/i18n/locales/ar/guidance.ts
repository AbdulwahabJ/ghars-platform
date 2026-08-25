const guidance = {
  tour: {
    done: "ابدأ العمل", next: "التالي", previous: "السابق", progress: "{{current}} من 6",
    navigationTitle: "التنقل الرئيسي", navigationDescription: "استخدم هذه التبويبات للانتقال بين الرئيسية، المرضى، والتقارير المالية.",
    searchTitle: "البحث عن مريض", searchDescription: "ابحث باستخدام اسم المريض، رقم الملف، أو رقم الجوال.",
    newPatientTitle: "إضافة حالة جديدة", newPatientDescription: "ابدأ من هنا لتسجيل مريض جديد أو إضافة حالة زراعة لمريض موجود.",
    overviewTitle: "ملخص العمل اليومي", overviewDescription: "تعرض هذه البطاقات المواعيد والمتابعات والحالات الجاهزة والمتأخرة.",
    workspaceTitle: "ملف المريض", workspaceDescription: "داخل ملف المريض ستجد البيانات، الزرعات، الدفعات، المتابعة، والملخص.",
    helpTitle: "المساعدة والتواصل", helpDescription: "يمكنك إعادة تشغيل الجولة التعريفية في أي وقت من علامة الاستفهام.",
    completeTitle: "انتهت الجولة", completeDescription: "أصبحت الآن جاهزًا لاستخدام النظام. يمكنك إعادة الجولة في أي وقت من علامة الاستفهام.",
    welcomeTitle: "مرحبًا بك في نظام متابعة زراعة الأسنان", welcomeDescription: "يمكنك أخذ جولة تعريفية قصيرة للتعرف على أهم أجزاء النظام.", welcomeDuration: "تستغرق الجولة أقل من دقيقة، ويمكنك تشغيلها لاحقًا من علامة الاستفهام.",
    start: "ابدأ الجولة", skip: "تخطي الآن",
  },
  quickHelp: {
    title: "مساعدة سريعة", addPatient: "لإضافة مريض:", addPatientText: "اضغط تسجيل حالة زراعة جديدة.",
    addCase: "لإضافة حالة:", addCaseText: "اضغط تسجيل حالة زراعة جديدة.", addImplant: "لإضافة زرعة:", addImplantText: "افتح ملف المريض ثم تبويب الزرعات.",
    search: "للبحث عن مريض:", searchText: "استخدم الاسم أو رقم الملف أو رقم الجوال.", openPatient: "لفتح ملف مريض:", openPatientText: "اضغط على سطر المريض في قائمة المرضى أو نتائج البحث.",
    editPatient: "لتعديل بيانات المريض:", editPatientText: "افتح ملف المريض، عدّل الحقول، ثم اضغط حفظ التعديلات.",
    archivePatient: "لأرشفة ملف أو استعادته:", archivePatientText: "من داخل ملف المريض في تبويب البيانات.",
    restartTour: "لإعادة الجولة التعريفية:", restartTourText: "من علامة الاستفهام في أعلى الشاشة.",
  },
  shortcuts: { title: "شرح الاختصارات", system: "نظام الزرعة", site: "رقم السن أو الموقع", size: "مقاس الزرعة", preserved: "قيمة محفوظة كما في السجل الأصلي", graft: "معلومات ترقيع العظم حسب إدخال المستخدم", pros: "مدة أو مرحلة التركيب", direct: "إجراء مباشر", immediate: "إجراء فوري" },
  dashboard: {
    openPatient: "فتح الملف", todayAppointments: "حالات المراجعة", noTodayAppointments: "لا توجد مواعيد متابعة اليوم.", overdueFollowups: "المتابعات المتأخرة", noOverdueFollowups: "لا توجد متابعات متأخرة.",
    casesPatients: "الحالات ({{count}} مريض)", addRecord: "إضافة سجل", searchOperational: "ابحث باسم المريض، رقم الملف أو رقم الجوال...", searchOperationalLabel: "البحث في التقرير التشغيلي", clearSearch: "مسح البحث",
    operationalReport: "التقرير التشغيلي ({{count}})", exportCsv: "تصدير CSV", print: "طباعة", reportLoadError: "تعذر تحميل التقرير التشغيلي. حاول تحديث الصفحة.", noFilteredCases: "لا توجد حالات مطابقة للفلاتر المحددة.",
    patient: "المريض", fileNumber: "رقم الملف", caseStatus: "حالة الحالة", treatingDoctor: "الطبيب المعالج", procedureDate: "تاريخ العملية", implants: "الزرعات", systems: "الأنظمة", nextFollowup: "المتابعة القادمة", remaining: "المتبقي", paymentStatus: "حالة السداد", overdue: "متأخرة", readyForProsthesis: "جاهزة للتركيب",
    statisticsLoadError: "تعذر تحميل الإحصائيات. حاول تحديث الصفحة.", noPeriodData: "لا توجد بيانات خلال الفترة المحددة.", overTime: "الحالات والزرعات عبر الزمن ({{grouping}})", daily: "يومي", monthly: "شهري", cases: "حالات", implantSystems: "توزيع أنظمة الزرعات", caseStatuses: "توزيع حالات الحالات", count: "عدد", implantStatuses: "توزيع حالات الزرعات", noPeriodImplants: "لا توجد زرعات خلال الفترة المحددة.", followupOutcomes: "نتائج المتابعات", noPeriodFollowupOutcomes: "لا توجد نتائج متابعات خلال الفترة المحددة.", failuresAndRedo: "الفشل وإعادة الزراعة", failedImplants: "زرعات فاشلة", needsRedoImplants: "زرعات تحتاج إعادة", reimplantationCases: "حالات إعادة زراعة",
    chooseDate: "اختر التاريخ", today: "اليوم", clear: "مسح", chooseTime: "اختر الوقت", clearTime: "مسح الوقت", time: "الوقت", dateTime: "التاريخ والوقت", am: "ص", pm: "م",
  },
} as const;
export default guidance;