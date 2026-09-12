import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  CheckCircle2,
  ShieldCheck,
  Stethoscope,
  LineChart,
  Wallet,
  Users,
  BellRing,
  Menu,
  X,
  FileText,
  Activity,
  Globe,
  MessageCircle,
  Headset,
  X as CloseIcon,
  ChevronDown,
  Image as ImageIcon
} from "lucide-react";
import { useState, useEffect } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useLocale } from "@/i18n/LocaleProvider";
import { useSupportContacts } from "@/hooks/use-commercial";
import { usePublicLandingMedia } from "@/hooks/use-landing-media";
import { buildSupportWhatsappLink } from "@/lib/support";
import gharsNavbarLogo from "@/assets/ghars-navbar-logo.png";
import gharsFooterLogo from "@/assets/ghars-footer-logo.png";

const CONTENT = {
  ar: {
    nav: {
      home: "الرئيسية",
      features: "المزايا",
      why: "لماذا غرس",
      gallery: "لقطات النظام",
      howItWorks: "كيف يعمل",
      faq: "الأسئلة الشائعة",
      login: "تسجيل الدخول",
      startTrial: "ابدأ تجربتك المجانية",
      dashboard: "لوحة التحكم"
    },
    hero: {
      title: "كل ما تحتاجه لإدارة زراعة الأسنان من مكان واحد",
      titleLine1: "كل ما تحتاجه لإدارة",
      titleLine2: "زراعة الأسنان",
      titleAccent: "من مكان واحد",
      subtitle: "غرس يساعد عيادات زراعة الأسنان على إدارة المرضى وحالات الزراعة والمتابعات والمواعيد والمدفوعات والتقارير من نظام واحد متكامل.",
      ctaPrimary: "ابدأ تجربتك المجانية",
      ctaSecondary: "تواصل معنا عبر واتساب",
      trialNote: "تجربة مجانية لمدة 3 أيام، بدون بطاقة ائتمان.",
      badges: ["متابعة حالات الزراعة", "تنظيم المرضى", "المالية والمدفوعات", "الإحصائيات والتقارير"]
    },
    intro: {
      badge: "عن غرس",
      title: "ما هو غرس؟",
      desc: "نظام سحابي متخصص صُمم بعناية لتلبية احتياجات عيادات زراعة الأسنان. يهدف غرس إلى تنظيم رحلة المريض منذ الزيارة الأولى وحتى إتمام التركيبات والمتابعة الدورية، مع ربط كامل للجانب المالي والإحصائي للعيادة."
    },
    features: {
      badge: "مزايا غرس",
      title: "كل ما تحتاجه في مكان واحد",
      subtitle: "تم تصميم غرس خصيصاً لعيادات زراعة الأسنان ليوفر لك تجربة إدارة سهلة ومنظمة واحترافية.",
      items: [
        { title: "الملف الطبي للمريض", desc: "سجل طبي متكامل لكل مريض مع الصور والملاحظات السريرية.", icon: FileText },
        { title: "متابعة الحالات والزرعات", desc: "إدارة كاملة لحالات الزرعات وتوثيق جميع الإجراءات والمراحل بدقة.", icon: Stethoscope },
        { title: "الإجراءات الجراحية", desc: "تسجيل تفاصيل زراعة العظم، ورفع الجيب الفكي مع التواريخ.", icon: Activity },
        { title: "المالية والدفعات", desc: "تتبع المدفوعات والمستحقات، وإصدار خطط تقسيط واضحة.", icon: Wallet },
        { title: "المتابعات والتنبيهات", desc: "لا تفوت أي متابعة مع تنبيهات ذكية ومواعيد تلقائية للمرضى.", icon: BellRing },
        { title: "الإحصائيات والتقارير", desc: "تقارير شاملة لمساعدتك في اتخاذ قرارات إدارية وطبية أفضل.", icon: LineChart },
        { title: "المستخدمون والصلاحيات", desc: "إدارة فريق العمل مع تحديد الصلاحيات لكل مستخدم بدقة.", icon: Users },
        { title: "دعم اللغتين", desc: "واجهة متكاملة تدعم العربية والإنجليزية لراحة فريقك.", icon: Globe },
      ]
    },
    why: {
      badge: "القيمة التجارية",
      title: "لماذا غرس؟",
      items: [
        "تنظيم العمل وتقليل الفوضى داخل العيادة.",
        "تحسين متابعة المرضى بشكل مستمر ودقيق.",
        "رؤية أوضح للمالية والمدفوعات المتأخرة.",
        "تسهيل المتابعة بعد العمليات الجراحية والزراعة.",
        "تحسين قرارات الإدارة بناءً على إحصائيات موثوقة."
      ]
    },
    howItWorks: {
      badge: "كيف نبدأ",
      title: "ثلاث خطوات للانطلاق",
      subtitle: "ابدأ إدارة عيادتك بكل سهولة خلال خطوات بسيطة.",
      steps: [
        { step: "1", title: "تسجيل العيادة", desc: "أنشئ حساب منشأتك واستمتع بتجربة مجانية كاملة لمدة 3 أيام." },
        { step: "2", title: "استخدام النظام", desc: "أضف مرضاك، وثّق حالات الزرعات، واكتشف سهولة إدارة عيادتك." },
        { step: "3", title: "تفعيل الحساب", desc: "تواصل مع الدعم الفني بعد انتهاء التجربة لتفعيل اشتراكك الدائم يدوياً." }
      ]
    },
    gallery: {
      badge: "لقطات من النظام",
      title: "شاهد النظام من الداخل",
      subtitle: "واجهة سهلة ومتكاملة مصممة لتناسب احتياجات عيادات زراعة الأسنان.",
      items: [
        { title: "لوحة التحكم", img: "/assets/dashboard.png" },
        { title: "تسجيل الدخول", img: "/assets/login_screen.png" },
        { title: "قائمة الحالات", img: "/assets/cases_list.png" },
        { title: "ملف المريض", img: "/assets/patient_file.png" },
        { title: "المالية والمدفوعات", img: "/assets/patient_finance.png" },
        { title: "الرسوم البيانية", img: "/assets/statistics_charts.png" },
        { title: "التقارير", img: "/assets/statistics_report.png" },
        { title: "إدارة الموظفين", img: "/assets/settings_staff.png" },
        { title: "إدارة المنصة", img: "/assets/settings_platform.png" },
      ]
    },
    trial: {
      title: "جاهز للارتقاء بعيادتك؟",
      subtitle: "انضم إلى عيادات زراعة الأسنان التي تثق في غرس. ابدأ تجربتك المجانية اليوم.",
      cta: "ابدأ التجربة المجانية",
      whatsapp: "تواصل معنا عبر واتساب",
      support: "تواصل مع الدعم الفني",
      note: "تجربة مجانية لمدة 3 أيام. لا حاجة لبوابة دفع. التفعيل يتم يدوياً بعد التواصل مع الدعم."
    },
    faq: {
      badge: "الأسئلة الشائعة",
      title: "كل ما تود معرفته",
      items: [
        { q: "هل توجد تجربة مجانية؟", a: "نعم، نقدم تجربة مجانية بالكامل لمدة 3 أيام لتتمكن من استكشاف كافة مميزات النظام قبل الاشتراك." },
        { q: "ماذا يحدث بعد انتهاء التجربة المجانية؟", a: "بعد انتهاء فترة الـ 3 أيام، ستحتاج للتواصل مع فريق الدعم الفني لتفعيل اشتراكك التجاري لضمان استمرارية الخدمة." },
        { q: "هل يوجد دفع إلكتروني داخل النظام؟", a: "لا، لا توجد بوابات دفع إلكترونية داخل النظام. عمليات الدفع وتفعيل الاشتراكات تتم يدوياً من خلال التواصل المباشر مع الدعم الفني." },
        { q: "هل البيانات معزولة وآمنة؟", a: "بكل تأكيد. نستخدم أعلى معايير الأمان السحابية وتشفير البيانات لضمان خصوصية معلومات عيادتك ومرضاك بشكل تام." },
        { q: "هل أستطيع إضافة أطباء وموظفين آخرين؟", a: "نعم، يدعم غرس تعدد المستخدمين ويتيح لك تحديد صلاحيات مخصصة لكل طبيب أو موظف استقبال أو إداري." },
      ]
    },
    footer: {
      quickLinks: "روابط سريعة",
      contactUs: "تواصل معنا",
      rights: "جميع الحقوق محفوظة © 2026 غرس",
      privacy: "سياسة الخصوصية",
      terms: "الشروط والأحكام"
    }
  },
  en: {
    nav: {
      home: "Home",
      features: "Features",
      why: "Why Ghars",
      gallery: "Gallery",
      howItWorks: "How it works",
      faq: "FAQ",
      login: "Login",
      startTrial: "Start Free Trial",
      dashboard: "Go to Dashboard"
    },
    hero: {
      title: "Everything you need to manage dental implants, in one place",
      titleLine1: "Everything you need",
      titleLine2: "to manage dental implants",
      titleAccent: "in one place",
      subtitle: "Ghars helps dental implant clinics manage patients, implant cases, follow-ups, appointments, payments, and reports from one integrated system.",
      ctaPrimary: "Start Free Trial",
      ctaSecondary: "Contact Us on WhatsApp",
      trialNote: "3-day free trial, no credit card required.",
      badges: ["Implant Cases", "Patient Management", "Finance & Payments", "Analytics & Reports"]
    },
    intro: {
      badge: "About Ghars",
      title: "What is Ghars?",
      desc: "A specialized cloud system carefully designed to meet the needs of dental implant clinics. Ghars aims to organize the patient's journey from the first visit to the completion of prosthetics and periodic follow-ups, with full integration of the clinic's financial and statistical aspects."
    },
    features: {
      badge: "Ghars Features",
      title: "Everything you need in one place",
      subtitle: "Ghars is specifically designed for dental implant clinics to provide you with an easy, organized, and professional management experience.",
      items: [
        { title: "Patient Medical File", desc: "Integrated medical record for each patient with photos and clinical notes.", icon: FileText },
        { title: "Implant Case Tracking", desc: "Full management of implant cases and accurate documentation of all procedures.", icon: Stethoscope },
        { title: "Surgical Procedures", desc: "Record details of bone grafting and sinus lifting with dates.", icon: Activity },
        { title: "Finances & Payments", desc: "Track payments and dues, and issue clear installment plans.", icon: Wallet },
        { title: "Follow-ups & Alerts", desc: "Never miss a follow-up with smart alerts and automated appointments.", icon: BellRing },
        { title: "Statistics & Reports", desc: "Comprehensive reports to help you make better administrative and medical decisions.", icon: LineChart },
        { title: "Users & Roles", desc: "Manage your team with precise role assignment for each user.", icon: Users },
        { title: "Bilingual Support", desc: "Fully integrated interface supporting Arabic and English.", icon: Globe },
      ]
    },
    why: {
      badge: "Business Value",
      title: "Why Ghars?",
      items: [
        "Organize workflow and reduce clinic chaos.",
        "Improve continuous and accurate patient follow-up.",
        "Clearer visibility of finances and overdue payments.",
        "Facilitate follow-ups after surgeries and implants.",
        "Enhance management decisions based on reliable statistics."
      ]
    },
    howItWorks: {
      badge: "Getting Started",
      title: "Three steps to launch",
      subtitle: "Start managing your clinic with ease in a few simple steps.",
      steps: [
        { step: "1", title: "Register Clinic", desc: "Create your facility account and enjoy a full 3-day free trial." },
        { step: "2", title: "Use the System", desc: "Add patients, document implant cases, and discover the ease of management." },
        { step: "3", title: "Activate Account", desc: "Contact tech support after the trial to manually activate your permanent subscription." }
      ]
    },
    gallery: {
      badge: "System Screenshots",
      title: "See the system from inside",
      subtitle: "An easy and integrated interface designed to fit the needs of dental implant clinics.",
      items: [
        { title: "Dashboard", img: "/assets/dashboard.png" },
        { title: "Login", img: "/assets/login_screen.png" },
        { title: "Cases List", img: "/assets/cases_list.png" },
        { title: "Patient File", img: "/assets/patient_file.png" },
        { title: "Finances", img: "/assets/patient_finance.png" },
        { title: "Charts", img: "/assets/statistics_charts.png" },
        { title: "Reports", img: "/assets/statistics_report.png" },
        { title: "Staff Management", img: "/assets/settings_staff.png" },
        { title: "Platform Management", img: "/assets/settings_platform.png" },
      ]
    },
    trial: {
      title: "Ready to elevate your clinic?",
      subtitle: "Join the dental implant clinics that trust Ghars. Start your free trial today.",
      cta: "Start Free Trial",
      whatsapp: "Contact us via WhatsApp",
      support: "Contact Tech Support",
      note: "3-day free trial. No payment gateway needed. Commercial activation is done manually after contacting technical support."
    },
    faq: {
      badge: "FAQ",
      title: "Everything you want to know",
      items: [
        { q: "Is there a free trial?", a: "Yes, we offer a completely free 3-day trial so you can explore all the system's features before subscribing." },
        { q: "What happens after the free trial ends?", a: "After the 3-day period ends, you will need to contact our technical support team to activate your commercial subscription to ensure service continuity." },
        { q: "Is there electronic payment inside the system?", a: "No, there are no electronic payment gateways inside the system. Payments and subscription activations are done manually through direct communication with technical support." },
        { q: "Is the data isolated and secure?", a: "Absolutely. We use the highest cloud security standards and data encryption to ensure the privacy of your clinic's and patients' information completely." },
        { q: "Can I add other doctors and staff?", a: "Yes, Ghars supports multiple users and allows you to set custom permissions for each doctor, receptionist, or administrator." },
      ]
    },
    footer: {
      quickLinks: "Quick Links",
      contactUs: "Contact Us",
      rights: "All rights reserved © 2026 Ghars",
      privacy: "Privacy Policy",
      terms: "Terms & Conditions"
    }
  }
};

export default function LandingPage() {
  const { direction, changeLocale } = useLocale();
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const t = CONTENT[lang];
  const isRTL = direction === 'rtl';

  const { user } = useAuth();
  const { data: supportContacts } = useSupportContacts();
  const supportWhatsappHref = buildSupportWhatsappLink(
    supportContacts?.whatsapp,
    "مرحباً، أود الاستفسار بخصوص منصة غرس."
  );
  const supportEmail = supportContacts?.email;
  const supportPhone = supportContacts?.phone;

  const { data: landingMedia } = usePublicLandingMedia();

  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    document.title = t.hero.title + " | غرس Ghars";
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', t.hero.subtitle);

    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', t.hero.title + " | غرس Ghars");

    let ogDesc = document.querySelector('meta[property="og:description"]');
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', t.hero.subtitle);

    let twTitle = document.querySelector('meta[name="twitter:title"]');
    if (!twTitle) {
      twTitle = document.createElement('meta');
      twTitle.setAttribute('name', 'twitter:title');
      document.head.appendChild(twTitle);
    }
    twTitle.setAttribute('content', t.hero.title);

    let twDesc = document.querySelector('meta[name="twitter:description"]');
    if (!twDesc) {
      twDesc = document.createElement('meta');
      twDesc.setAttribute('name', 'twitter:description');
      document.head.appendChild(twDesc);
    }
    twDesc.setAttribute('content', t.hero.subtitle);

  }, [lang, t, isRTL]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleLanguage = () => {
    changeLocale(lang === 'ar' ? 'en' : 'ar');
  };

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const getAssetPath = (path: string) => {
    if (path.startsWith('/objects/')) {
      return `/api/storage${path}`;
    }
    return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
  };

  // Determine resolved media
  const storedHeroTitle = landingMedia?.hero
    ? (isRTL ? landingMedia.hero.titleAr : landingMedia.hero.titleEn)
    : null;
  const storedHeroSubtitle = landingMedia?.hero
    ? (isRTL ? landingMedia.hero.descriptionAr : landingMedia.hero.descriptionEn)
    : null;
  const legacyHeroTitle = isRTL
    ? "منصة ذكية لإدارة زراعة الأسنان"
    : "Smart Platform for Dental Implants";
  const legacyHeroSubtitle = isRTL
    ? "غرس تساعد عيادات زراعة الأسنان على إدارة المرضى، حالات الزرعات، الإجراءات الجراحية مثل ترقيع العظم ورفع الجيب، والمتابعات، والدفعات، والتقارير من نظام واحد متكامل."
    : "Ghars helps dental implant clinics manage patients, implant cases, surgical procedures like bone grafting and sinus lifting, follow-ups, payments, and reports from one integrated system.";
  const heroTitle = storedHeroTitle && storedHeroTitle !== legacyHeroTitle
    ? storedHeroTitle
    : t.hero.title;
  const heroSubtitle = storedHeroSubtitle && storedHeroSubtitle !== legacyHeroSubtitle
    ? storedHeroSubtitle
    : t.hero.subtitle;
  const usesApprovedHeroTitle = heroTitle === t.hero.title;

  const heroImageSrc = landingMedia?.hero
    ? getAssetPath(landingMedia.hero.fileRef)
    : getAssetPath("/assets/dashboard.png");

  const galleryItems = landingMedia?.gallery && landingMedia.gallery.length > 0
    ? landingMedia.gallery.map(g => ({
        title: isRTL ? g.titleAr : g.titleEn,
        img: getAssetPath(g.fileRef)
      }))
    : t.gallery.items.map(g => ({
        title: g.title,
        img: getAssetPath(g.img)
      }));

  return (
    <div className={`min-h-screen max-w-full overflow-x-hidden bg-background font-sans ${isRTL ? "font-brand-arabic" : "font-brand-latin"}`} dir={isRTL ? "rtl" : "ltr"}>

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "bg-white/90 backdrop-blur-md border-b border-border shadow-sm py-3" : "bg-transparent py-5"}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-2" dir="ltr">
            <span
              className="notranslate inline-flex items-baseline whitespace-nowrap text-[#0D1B3D] font-semibold text-lg sm:text-xl tracking-tight"
              translate="no"
              aria-label="غرس | Ghars"
            >
              <span dir="rtl" className="font-brand-arabic">غرس</span>
              <span className="mx-1 text-[#64748B]">|</span>
              <span className="font-brand-latin text-[0.9em]">Ghars</span>
            </span>
            <img src={gharsNavbarLogo} alt="Ghars official icon" className="w-8 h-8 sm:w-9 sm:h-9 object-contain" />
          </div>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8 text-[#64748B] font-medium">
            <button data-testid="btn-scroll" onClick={() => scrollTo("features")} className="hover:text-[#0F766E] transition-colors">{t.nav.features}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("why")} className="hover:text-[#0F766E] transition-colors">{t.nav.why}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("how-it-works")} className="hover:text-[#0F766E] transition-colors">{t.nav.howItWorks}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("gallery")} className="hover:text-[#0F766E] transition-colors">{t.nav.gallery}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("faq")} className="hover:text-[#0F766E] transition-colors">{t.nav.faq}</button>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button data-testid="btn-toggle-lang" onClick={toggleLanguage} className="text-[#64748B] hover:text-[#0D1B3D] font-medium px-2">
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            {user ? (
              <Link data-testid="link-dashboard" href="/dashboard" className="btn-primary bg-[#0D1B3D] text-white hover:bg-[#0D1B3D]/90 h-10 text-sm px-6">
                {t.nav.dashboard}
              </Link>
            ) : (
              <>
                <Link data-testid="link-login" href="/login" className="text-[#0D1B3D] font-semibold hover:text-[#0F766E] transition-colors">
                  {t.nav.login}
                </Link>
                <Link data-testid="link-register" href="/register" className="btn-primary bg-[#0D1B3D] text-white hover:bg-[#0D1B3D]/90 h-10 text-sm px-6">
                  {t.nav.startTrial}
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden text-[#0D1B3D] p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy rounded-md"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
          </button>
        </div>

        {/* Mobile Nav */}
        <div
          id="mobile-menu"
          className={`md:hidden absolute top-full left-0 right-0 bg-white border-b border-border shadow-lg py-4 px-4 flex flex-col gap-4 transition-all duration-300 ${mobileMenuOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"}`}
          aria-hidden={!mobileMenuOpen}
        >
            <button data-testid="btn-scroll" onClick={() => scrollTo("features")} className="text-[#64748B] font-medium text-start py-2 border-b border-gray-100">{t.nav.features}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("why")} className="text-[#64748B] font-medium text-start py-2 border-b border-gray-100">{t.nav.why}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("how-it-works")} className="text-[#64748B] font-medium text-start py-2 border-b border-gray-100">{t.nav.howItWorks}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("gallery")} className="text-[#64748B] font-medium text-start py-2 border-b border-gray-100">{t.nav.gallery}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("faq")} className="text-[#64748B] font-medium text-start py-2 border-b border-gray-100">{t.nav.faq}</button>
            <div className="flex flex-col gap-3 mt-2">
              <button data-testid="btn-toggle-lang" onClick={toggleLanguage} className="text-[#64748B] font-medium text-start py-2 border-b border-gray-100">
                {lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
              </button>
              {user ? (
                <Link href="/dashboard" className="text-center py-2 bg-[#0D1B3D] text-white font-semibold rounded-lg">
                  {t.nav.dashboard}
                </Link>
              ) : (
                <>
                  <Link data-testid="link-login" href="/login" className="text-center py-2 text-[#0D1B3D] font-semibold border border-[#0D1B3D] rounded-lg">
                    {t.nav.login}
                  </Link>
                  <Link data-testid="link-register" href="/register" className="text-center py-2 bg-[#0D1B3D] text-white font-semibold rounded-lg">
                    {t.nav.startTrial}
                  </Link>
                </>
              )}
            </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#F7FAFC] pt-24 sm:pt-28 lg:pt-28 lg:min-h-[780px]">
        <div className="absolute inset-x-0 top-0 h-px bg-white"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 pb-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(370px,0.8fr)] lg:gap-10 lg:pb-12" dir="ltr">
            <div className="order-2 relative min-w-0 lg:order-1 lg:py-4">
              <div
                className="absolute -inset-x-10 -inset-y-14 bg-cover bg-center opacity-[0.22] blur-[1px]"
                style={{ backgroundImage: `url(${getAssetPath("/assets/dental-clinic-bg.jpg")})` }}
                aria-hidden="true"
              ></div>
              <div className="absolute -inset-x-10 -inset-y-14 bg-gradient-to-r from-white/15 via-[#F7FAFC]/25 to-[#F7FAFC] lg:bg-gradient-to-r lg:from-white/5 lg:via-[#F7FAFC]/20 lg:to-[#F7FAFC]"></div>
              <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-1000">
                <div className="overflow-hidden rounded-xl border border-white/80 bg-white p-1.5 shadow-[0_24px_65px_-28px_rgba(13,27,61,0.38)] sm:p-2">
                  <div className="flex h-7 items-center gap-1.5 rounded-t-lg bg-[#EEF3F6] px-3 sm:h-8 sm:px-4">
                    <span className="h-2 w-2 rounded-full bg-[#F87171] sm:h-2.5 sm:w-2.5"></span>
                    <span className="h-2 w-2 rounded-full bg-[#FBBF24] sm:h-2.5 sm:w-2.5"></span>
                    <span className="h-2 w-2 rounded-full bg-[#34D399] sm:h-2.5 sm:w-2.5"></span>
                  </div>
                  <img
                    src={heroImageSrc}
                    alt={heroTitle}
                    className="w-full rounded-b-lg border-t border-gray-100 object-cover"
                  />
                </div>
              </div>
            </div>

            <div className="order-1 relative z-10 text-center lg:order-2 lg:text-start" dir={isRTL ? "rtl" : "ltr"}>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#EAF7F5] px-3 py-1.5 text-xs font-medium text-[#0F766E] ring-1 ring-inset ring-[#1FA9B8]/20">
                <CheckCircle2 size={15} strokeWidth={2} />
                <span>{t.hero.trialNote}</span>
              </div>
              <h1 className={`mb-5 text-[2.2rem] font-bold leading-[1.18] text-[#0D1B3D] sm:text-[2.75rem] animate-in fade-in slide-in-from-bottom-4 duration-700 ${isRTL ? "lg:text-[clamp(2.55rem,3.15vw,3.6rem)]" : "lg:text-[2.7rem] lg:leading-[1.12]"}`}>
                {usesApprovedHeroTitle ? (
                  <>
                    <span className="block">{t.hero.titleLine1}</span>
                    <span className="block">{t.hero.titleLine2}</span>
                    <span className="relative mt-0.5 inline-block">
                      <span className="relative z-10">{t.hero.titleAccent}</span>
                      <span className="absolute inset-x-0 bottom-1 -z-0 h-1.5 rounded-full bg-[#1FA9B8]/25" aria-hidden="true"></span>
                    </span>
                  </>
                ) : heroTitle}
              </h1>
              <p className="mx-auto mb-6 max-w-[34rem] text-[15px] leading-7 text-[#64748B] sm:text-base lg:mx-0 lg:max-w-[31rem] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                {heroSubtitle}
              </p>
              <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                <Link data-testid="link-register" href="/register" className="btn-primary h-[52px] w-full bg-[#0D1B3D] px-7 text-base text-white shadow-lg shadow-[#0D1B3D]/15 hover:bg-[#142A59] sm:w-auto">
                  {t.hero.ctaPrimary}
                </Link>
                {supportWhatsappHref ? (
                  <a href={supportWhatsappHref} target="_blank" rel="noopener noreferrer" className="btn-outline h-[52px] w-full border-[#0D1B3D]/15 bg-white/80 px-6 text-base text-[#0D1B3D] hover:bg-white sm:w-auto">
                    <MessageCircle className="me-2 text-[#25D366]" size={19} />
                    {t.hero.ctaSecondary}
                  </a>
                ) : (
                  <button disabled className="btn-outline h-[52px] w-full border-[#0D1B3D]/15 bg-white/80 px-6 text-base text-[#0D1B3D] opacity-50 sm:w-auto">
                    <MessageCircle className="me-2 text-[#25D366]" size={19} />
                    {t.hero.ctaSecondary}
                  </button>
                )}
              </div>

              <div className="mt-8 hidden grid-cols-2 gap-x-5 gap-y-4 border-t border-[#0D1B3D]/8 pt-6 sm:grid lg:grid-cols-2">
                {t.hero.badges.map((badge, i) => {
                  const BadgeIcon = [Stethoscope, Users, Wallet, LineChart][i];
                  return (
                    <div key={badge} className="flex items-center gap-2.5 text-sm font-medium text-[#0D1B3D]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF7F5] text-[#0F766E]">
                        <BadgeIcon size={17} strokeWidth={1.8} />
                      </span>
                      <span>{badge}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#0D1B3D]/8 pb-10 pt-5 sm:hidden">
            {t.hero.badges.map((badge, i) => {
              const BadgeIcon = [Stethoscope, Users, Wallet, LineChart][i];
              return (
                <div key={badge} className="flex items-center gap-2 text-xs font-medium text-[#0D1B3D]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#EAF7F5] text-[#0F766E]">
                    <BadgeIcon size={15} strokeWidth={1.8} />
                  </span>
                  <span>{badge}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Intro Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <span className="text-[#0F766E] font-bold text-sm tracking-wider uppercase mb-3 block">{t.intro.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-6">{t.intro.title}</h2>
            <p className="text-lg text-[#64748B] leading-relaxed">
              {t.intro.desc}
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-[#F5F8FA]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[#0F766E] font-bold text-sm tracking-wider uppercase mb-3 block">{t.features.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-4">{t.features.title}</h2>
            <p className="text-[#64748B] text-lg">{t.features.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {t.features.items.map((feature, i) => (
              <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-border hover:shadow-md transition-shadow group">
                <div className="w-14 h-14 bg-[#ECF8F6] text-[#0F766E] rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-[#0F766E] group-hover:text-white transition-all duration-300">
                  <feature.icon size={28} />
                </div>
                <h3 className="text-xl font-bold text-[#0D1B3D] mb-3">{feature.title}</h3>
                <p className="text-[#64748B] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Ghars Section */}
      <section id="why" className="py-24 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-[#1FA9B8] font-bold text-sm tracking-wider uppercase mb-3 block">{t.why.badge}</span>
              <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-8">{t.why.title}</h2>
              <ul className="space-y-6">
                {t.why.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <div className="mt-1 w-6 h-6 rounded-full bg-[#ECF8F6] text-[#0F766E] flex items-center justify-center shrink-0">
                      <CheckCircle2 size={14} />
                    </div>
                    <span className="text-lg text-[#64748B]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-[#0F766E]/5 rounded-3xl -rotate-6 scale-105"></div>
              <img src={getAssetPath("/assets/patient_finance.png")} loading="lazy" alt={lang === "ar" ? "المالية والمدفوعات في غرس" : "Ghars finances and payments"} className="relative z-10 rounded-2xl shadow-xl border border-gray-100" />
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-24 bg-[#F5F8FA] relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[#0F766E] font-bold text-sm tracking-wider uppercase mb-3 block">{t.howItWorks.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-4">{t.howItWorks.title}</h2>
            <p className="text-[#64748B] text-lg">{t.howItWorks.subtitle}</p>
          </div>

          <div className="relative max-w-4xl mx-auto">
            {/* Connecting Line */}
            <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-[#0F766E]/10 via-[#0F766E]/30 to-[#0F766E]/10 -translate-y-1/2"></div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
              {t.howItWorks.steps.map((step, i) => (
                <div key={i} className="text-center">
                  <div className="w-20 h-20 mx-auto bg-white border-4 border-[#ECF8F6] rounded-full flex items-center justify-center shadow-lg shadow-[#0F766E]/10 mb-6 relative">
                    <span className="text-3xl font-bold text-[#0F766E]">{step.step}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-[#0D1B3D] mb-4">{step.title}</h3>
                  <p className="text-[#64748B] text-lg leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Section */}
      <section id="gallery" className="py-24 bg-[#0D1B3D] text-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[#1FA9B8] font-bold text-sm tracking-wider uppercase mb-3 block">{t.gallery.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.gallery.title}</h2>
            <p className="text-white/70 text-lg">{t.gallery.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {galleryItems.map((item, i) => (
              <div
                key={i}
                className="group relative rounded-xl overflow-hidden bg-white/5 border border-white/10 hover:border-white/30 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA9B8]"
                onClick={() => setLightboxImage(item.img)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setLightboxImage(item.img)}
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={item.img}
                    alt={item.title}
                    loading="lazy"
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0D1B3D] via-[#0D1B3D]/50 to-transparent opacity-80"></div>
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-xl font-bold text-white">{item.title}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="absolute top-6 right-6 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            onClick={() => setLightboxImage(null)}
            aria-label="Close image preview"
          >
            <CloseIcon size={32} />
          </button>
          <img
            src={lightboxImage}
            alt="Expanded view"
            className="max-w-full max-h-[90vh] object-contain rounded-lg border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* FAQ Section */}
      <section id="faq" className="py-24 bg-[#F5F8FA]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[#0F766E] font-bold text-sm tracking-wider uppercase mb-3 block">{t.faq.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-4">{t.faq.title}</h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {t.faq.items.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className="bg-white border border-border rounded-xl overflow-hidden transition-all duration-300">
                  <button
                    className="w-full px-6 py-5 flex items-center justify-between text-start focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0F766E]"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${i}`}
                  >
                    <span className="font-bold text-lg text-[#0D1B3D]">{item.q}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#F0F4F6] text-[#0F766E] transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
                      <ChevronDown size={20} />
                    </div>
                  </button>
                  <div
                    id={`faq-answer-${i}`}
                    className={`px-6 overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
                    aria-hidden={!isOpen}
                    style={{ display: isOpen ? 'block' : 'none' }}
                  >
                    <p className="text-[#64748B] leading-relaxed mt-2">{item.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0D1B3D]"></div>
        <div className="absolute inset-0 bg-gradient-to-tr from-[#0F766E]/20 to-transparent"></div>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 max-w-3xl mx-auto">{t.trial.title}</h2>
          <p className="text-white/80 text-xl mb-10 max-w-2xl mx-auto">{t.trial.subtitle}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link data-testid="link-register-footer" href="/register" className="btn-primary bg-[#0F766E] hover:bg-[#0F766E]/90 text-white border-none text-lg h-14 px-8 w-full sm:w-auto shadow-xl">
              {t.trial.cta}
            </Link>
            {supportWhatsappHref ? (
              <a href={supportWhatsappHref} target="_blank" rel="noopener noreferrer" className="btn-outline border-white/20 text-white hover:bg-white/10 text-lg h-14 px-8 w-full sm:w-auto">
                <MessageCircle className="me-2 text-[#25D366]" size={20} />
                {t.trial.whatsapp}
              </a>
            ) : (
              <button disabled className="btn-outline border-white/20 text-white text-lg h-14 px-8 w-full sm:w-auto opacity-50 cursor-not-allowed">
                <Headset className="me-2" size={20} />
                {t.trial.support}
              </button>
            )}
          </div>
          <p className="text-white/60 text-sm mt-8 max-w-lg mx-auto leading-relaxed bg-white/5 p-4 rounded-lg border border-white/10">{t.trial.note}</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0D1B3D] text-white pt-16 pb-8 border-t border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-3 mb-6" dir="ltr">
                <span className="notranslate inline-flex items-baseline whitespace-nowrap font-semibold text-2xl tracking-tight">
                  <span dir="rtl" className="font-brand-arabic">غرس</span>
                  <span className="mx-1 text-white/50">|</span>
                  <span className="font-brand-latin text-[0.9em]">Ghars</span>
                </span>
                <img src={gharsFooterLogo} alt="Ghars" className="w-10 h-10 object-contain" />
              </div>
              <p className="text-white/60 leading-relaxed max-w-sm text-start">
                {t.hero.subtitle}
              </p>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6 text-start">{t.footer.quickLinks}</h4>
              <ul className="space-y-3 flex flex-col items-start">
                <li><button onClick={() => scrollTo("features")} className="text-white/60 hover:text-white transition-colors">{t.nav.features}</button></li>
                <li><button onClick={() => scrollTo("why")} className="text-white/60 hover:text-white transition-colors">{t.nav.why}</button></li>
                <li><button onClick={() => scrollTo("how-it-works")} className="text-white/60 hover:text-white transition-colors">{t.nav.howItWorks}</button></li>
                <li><button onClick={() => scrollTo("gallery")} className="text-white/60 hover:text-white transition-colors">{t.nav.gallery}</button></li>
                <li><button onClick={() => scrollTo("faq")} className="text-white/60 hover:text-white transition-colors">{t.nav.faq}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6 text-start">{t.footer.contactUs}</h4>
              <ul className="space-y-3 flex flex-col items-start">
                {supportWhatsappHref && (
                  <li>
                    <a href={supportWhatsappHref} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white transition-colors flex items-center gap-2">
                      <MessageCircle size={18} />
                      <span dir="ltr">{supportContacts?.whatsapp}</span>
                    </a>
                  </li>
                )}
                {supportPhone && (
                  <li>
                    <a href={`tel:${supportPhone}`} className="text-white/60 hover:text-white transition-colors flex items-center gap-2" dir="ltr">
                      <Headset size={18} />
                      {supportPhone}
                    </a>
                  </li>
                )}
                {supportEmail && (
                  <li>
                    <a href={`mailto:${supportEmail}`} className="text-white/60 hover:text-white transition-colors flex items-center gap-2 break-all" dir="ltr">
                      <Globe size={18} />
                      {supportEmail}
                    </a>
                  </li>
                )}
                {!supportWhatsappHref && !supportEmail && !supportPhone && (
                  <li><span className="text-white/40 italic">-</span></li>
                )}
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm">{t.footer.rights}</p>
            <div className="flex gap-6 text-sm">
              <Link href="/privacy" className="text-white/40 hover:text-white transition-colors">{t.footer.privacy}</Link>
              <Link href="/terms" className="text-white/40 hover:text-white transition-colors">{t.footer.terms}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
