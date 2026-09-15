import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  ShieldCheck,
  Stethoscope,
  LineChart,
  Wallet,
  Users,
  BellRing,
  Menu,
  X,
  FileText,
  Globe,
  MessageCircle,
  Headset,
  X as CloseIcon,
  ChevronDown,
  Image as ImageIcon,
  ArrowUpFromLine,
  Scissors,
  Crown,
  CalendarCheck2
} from "lucide-react";
import { useState, useEffect, type SVGProps } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useLocale } from "@/i18n/LocaleProvider";
import { useSupportContacts } from "@/hooks/use-commercial";
import { usePublicLandingMedia } from "@/hooks/use-landing-media";
import { buildSupportWhatsappLink } from "@/lib/support";
import gharsNavbarLogo from "@/assets/ghars-navbar-logo.png";
import gharsFooterLogo from "@/assets/ghars-footer-logo.png";

type JawBoneIconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
};

function DentalImplantIcon({ size = 20, strokeWidth = 1.8, ...props }: JawBoneIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M7 4.5h10l-1.2 5H8.2l-1.2-5Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 9.5h5.6v2.2H9.2zM10.2 11.7h3.6l-.7 7.8H11l-.8-7.8ZM10.6 14.2h2.8M10.8 16.7h2.4"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function JawBoneIcon({ size = 20, strokeWidth = 1.8, ...props }: JawBoneIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M4.5 7.5c-.5 3.8.6 8 3.7 10.6 2.1 1.8 5.5 1.8 7.6 0 3.1-2.6 4.2-6.8 3.7-10.6"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 8.2c.9 1.1 2.1 1.7 3.4 1.7h4.8c1.3 0 2.5-.6 3.4-1.7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d="M17.8 2.8v3.2M16.2 4.4h3.2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

const CONTENT = {
  ar: {
    nav: {
      home: "الرئيسية",
      features: "قدرات غرس",
      gallery: "لقطات النظام",
      howItWorks: "كيف يعمل",
      faq: "الأسئلة الشائعة",
      login: "تسجيل الدخول",
      startTrial: "ابدأ تجربتك المجانية",
      dashboard: "لوحة التحكم"
    },
    hero: {
      title: "أدر رحلة العلاج كاملة من الجراحة إلى التركيب والمتابعة",
      titleLine1: "أدر رحلة العلاج كاملة",
      titleLine2: "من الجراحة إلى التركيب والمتابعة",
      subtitle: "غرس يجمع حالات الزراعة، زراعة العظم، رفع الجيب الفكي، الإجراءات الجراحية، التركيبات، المتابعات، المواعيد والمدفوعات في نظام واحد مصمم لعيادات الأسنان.",
       credibility: "طُوّر بإشراف د. همام الكيال وبخبرة سريرية تتجاوز 5,000 حالة وإجراء.",
      ctaPrimary: "ابدأ تجربتك المجانية",
      ctaSecondary: "تواصل معنا عبر واتساب",
      badges: ["متابعة حالات الزراعة", "تنظيم المرضى", "المالية والمدفوعات", "الإحصائيات والتقارير"]
    },
     credibility: {
       eyebrow: "الخبرة وراء غرس",
       title: "صُمم من واقع الممارسة… وليس من افتراضات تقنية",
       body: [
         "تم تطوير غرس بإشراف د. همام الكيال، وبالاستناد إلى خبرة سريرية تتجاوز 5,000 حالة وإجراء في زراعة الأسنان وجراحات وتجميل الوجه والفكين.",
          "هذه الخبرة انعكست على تفاصيل النظام، ليكون غرس أداة عملية مبنية حول سير العمل الحقيقي للطبيب والعيادة، من الجراحة وحتى التركيب والمتابعة."
       ],
       items: [
         { value: "+5,000", label: "حالة وإجراء سريري" },
         { value: "خبرة تخصصية", label: "في الزراعة وجراحات الوجه والفكين" },
         { value: "من واقع العيادة", label: "تصميم مبني على احتياجات العمل اليومية" }
       ]
     },
    clinical: {
      badge: "الرحلة السريرية",
      title: "من الجراحة إلى التركيب والمتابعة",
      subtitle: "يوثّق غرس مراحل العلاج والإجراءات المصاحبة في ملف واحد مترابط، لتبقى حالة المريض واضحة من أول إجراء حتى آخر متابعة.",
      items: [
          { title: "حالات زراعة الأسنان", desc: "إدارة الزرعات ومواقعها وأنظمتها ومراحلها العلاجية داخل ملف المريض.", icon: DentalImplantIcon },
          { title: "زراعة العظم", desc: "توثيق إجراءات زراعة العظم والمواد والأغشية والمتابعة المرتبطة بها.", icon: JawBoneIcon },
         { title: "رفع الجيب الفكي", desc: "تسجيل إجراءات رفع الجيب الفكي وربطها بالحالة والزرعات والمتابعات.", icon: ArrowUpFromLine },
         { title: "الإجراءات الجراحية المصاحبة", desc: "توثيق الإجراءات الجراحية مثل إعادة تموضع العصب والإجراءات المساندة للحالة.", icon: Scissors },
        { title: "التركيبات", desc: "متابعة مراحل التركيب المؤقت والنهائي وربطها بحالة الزرعات.", icon: Crown },
        { title: "المتابعات", desc: "تنظيم المتابعات والمواعيد وحالة كل متابعة ضمن رحلة علاج المريض.", icon: CalendarCheck2 }
      ],
    },
     features: {
       badge: "قدرات غرس التشغيلية",
       title: "إدارة العيادة حول سير عمل واحد",
       subtitle: "يجمع غرس التفاصيل اليومية التي يحتاجها الطبيب وفريق العيادة في مساحة واضحة ومترابطة.",
       items: [
         { title: "الملف الطبي للمريض", desc: "سجل موحّد يجمع البيانات السريرية وتاريخ الحالة والإجراءات في مكان واحد.", icon: FileText },
         { title: "المتابعات والتنبيهات", desc: "تنظيم المراجعات والمتابعات والتنبيهات لتقليل فقدان متابعة الحالات.", icon: BellRing },
         { title: "المالية والمدفوعات", desc: "متابعة الرسوم والمدفوعات والخصومات وخطط التقسيط المرتبطة بالحالة.", icon: Wallet },
         { title: "الإحصائيات والتقارير", desc: "رؤية واضحة للحالات والزرعات والمتابعات والمؤشرات التشغيلية.", icon: LineChart },
         { title: "المستخدمون والصلاحيات", desc: "إدارة الفريق وتحديد الصلاحيات حسب دور كل مستخدم.", icon: Users },
         { title: "دعم اللغتين والعمل السحابي", desc: "واجهة عربية وإنجليزية مع إمكانية الوصول إلى النظام من أي مكان.", icon: Globe },
       ]
     },
    howItWorks: {
      badge: "كيف تبدأ",
      title: "ثلاث خطوات للانطلاق",
      subtitle: "ابدأ إدارة عيادتك بكل سهولة خلال خطوات بسيطة.",
      steps: [
        { step: "1", title: "تسجيل العيادة", desc: "أنشئ حساب منشأتك وابدأ تجربة مجانية لمدة 3 أيام." },
         { step: "2", title: "ابدأ استخدام غرس", desc: "أضف المرضى والحالات وابدأ تنظيم الإجراءات والمتابعات والبيانات من مكان واحد." },
         { step: "3", title: "فعّل حسابك", desc: "بعد انتهاء التجربة يمكنك تفعيل غرس بشكل دائم والاستمرار ببياناتك دون انقطاع." }
      ]
    },
    gallery: {
      badge: "لقطات من النظام",
      title: "شاهد النظام من الداخل",
      subtitle: "واجهة سهلة ومتكاملة مصممة لتناسب احتياجات عيادات زراعة الأسنان.",
      items: [
        { title: "لوحة التحكم", img: "/assets/dashboard.png" },
         { title: "سجلات المرضى", img: "/assets/cases_list.png" },
         { title: "الملف الطبي للمريض", img: "/assets/patient_file.png" },
         { title: "الإجراءات والمتابعات", img: "/assets/patient_file.png" },
         { title: "الإحصائيات", img: "/assets/statistics_charts.png" },
         { title: "المالية", img: "/assets/patient_finance.png" },
         { title: "الحالات", img: "/assets/cases_list.png" },
      ]
    },
    trial: {
       title: "جرّب غرس داخل عيادتك لمدة 3 أيام",
       subtitle: "ابدأ مجانًا، واختبر سير العمل الفعلي قبل اتخاذ قرار التفعيل.",
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
      features: "Ghars capabilities",
      gallery: "Gallery",
      howItWorks: "How it works",
      faq: "FAQ",
      login: "Login",
      startTrial: "Start Free Trial",
      dashboard: "Go to Dashboard"
    },
    hero: {
      title: "Manage the entire treatment journey from surgery to prosthetics and follow-up",
      titleLine1: "Manage the entire treatment journey",
      titleLine2: "from surgery to prosthetics and follow-up",
      subtitle: "Ghars brings implant cases, bone grafting, sinus lift procedures, adjunct surgical procedures, prosthetics, follow-ups, appointments, and payments together in one system built for dental clinics.",
       credibility: "Developed under the supervision of Dr. Humam Al-Kayyal, drawing on experience across more than 5,000 clinical cases and procedures.",
      ctaPrimary: "Start Free Trial",
      ctaSecondary: "Contact Us on WhatsApp",
      badges: ["Implant Cases", "Patient Management", "Finance & Payments", "Analytics & Reports"]
    },
     credibility: {
       eyebrow: "The experience behind Ghars",
       title: "Built from real clinical practice.",
       body: [
         "Ghars was developed under the supervision of Dr. Humam Al-Kayyal, drawing on clinical experience across more than 5,000 cases and procedures in dental implantology, oral and maxillofacial surgery, and facial aesthetics.",
          "That experience shaped Ghars around the real workflow of doctors and dental clinics, from surgery to prosthetics and follow-up."
       ],
       items: [
         { value: "+5,000", label: "Clinical cases and procedures" },
         { value: "Specialist experience", label: "In implantology and oral & maxillofacial surgery" },
         { value: "Built in the clinic", label: "Designed around everyday workflow needs" }
       ]
     },
    clinical: {
      badge: "Clinical Workflow",
      title: "From surgery to prosthetics and follow-up",
      subtitle: "Ghars keeps treatment stages and related procedures connected in one patient record, from the first procedure through the final follow-up.",
      items: [
          { title: "Dental Implant Cases", desc: "Manage implants, sites, systems, and treatment stages inside the patient record.", icon: DentalImplantIcon },
        { title: "Bone Grafting", desc: "Document bone grafting procedures, materials, membranes, and related follow-up.", icon: JawBoneIcon },
         { title: "Sinus Lift", desc: "Record sinus lift procedures and connect them to the case, implants, and follow-ups.", icon: ArrowUpFromLine },
         { title: "Adjunct Surgical Procedures", desc: "Document procedures such as nerve repositioning and other supporting surgery.", icon: Scissors },
        { title: "Prosthetics", desc: "Track temporary and final prosthetic stages and connect them to implant status.", icon: Crown },
        { title: "Follow-ups", desc: "Organize follow-ups, appointments, and each follow-up status across the journey.", icon: CalendarCheck2 }
      ],
    },
     features: {
       badge: "Operational capabilities",
       title: "One workflow for the whole clinic",
       subtitle: "Ghars brings the daily details your doctors and clinic team rely on into one clear, connected workspace.",
       items: [
         { title: "Patient Medical Record", desc: "A unified record for clinical data, case history, and procedures in one place.", icon: FileText },
         { title: "Follow-ups & Alerts", desc: "Organize reviews, follow-ups, and alerts so cases do not fall through the cracks.", icon: BellRing },
         { title: "Finance & Payments", desc: "Track fees, payments, discounts, and installment plans linked to each case.", icon: Wallet },
         { title: "Analytics & Reports", desc: "Clear visibility into cases, implants, follow-ups, and operational indicators.", icon: LineChart },
         { title: "Users & Permissions", desc: "Manage your team and set permissions by each user's role.", icon: Users },
         { title: "Bilingual & Cloud Access", desc: "Arabic and English support with access to the system from anywhere.", icon: Globe },
       ]
     },
    howItWorks: {
      badge: "Getting Started",
      title: "Three Steps to Get Started",
      subtitle: "Start managing your clinic with ease in a few simple steps.",
      steps: [
        { step: "1", title: "Register Your Clinic", desc: "Create your clinic account and start a free 3-day trial." },
         { step: "2", title: "Start Using Ghars", desc: "Add patients and cases, then organize procedures, follow-ups, and data from one place." },
         { step: "3", title: "Activate Your Account", desc: "After the trial ends, activate Ghars permanently and continue with your data without interruption." }
      ]
    },
    gallery: {
      badge: "System Screenshots",
      title: "See the system from inside",
      subtitle: "An easy and integrated interface designed to fit the needs of dental implant clinics.",
      items: [
        { title: "Dashboard", img: "/assets/dashboard.png" },
         { title: "Patient Records", img: "/assets/cases_list.png" },
         { title: "Patient Medical Record", img: "/assets/patient_file.png" },
         { title: "Procedures / Follow-up", img: "/assets/patient_file.png" },
         { title: "Statistics", img: "/assets/statistics_charts.png" },
         { title: "Finance", img: "/assets/patient_finance.png" },
         { title: "Cases", img: "/assets/cases_list.png" },
      ]
    },
    trial: {
       title: "Try Ghars in your clinic for 3 days",
       subtitle: "Start for free and experience the real workflow before deciding to activate.",
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
    <div className={`min-h-screen max-w-full overflow-x-hidden bg-[#F7F9FC] font-sans ${isRTL ? "font-brand-arabic" : "font-brand-latin"}`} dir={isRTL ? "rtl" : "ltr"}>
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
            <button data-testid="btn-scroll" onClick={() => scrollTo("features")} className="landing-nav-link">{t.nav.features}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("gallery")} className="landing-nav-link">{t.nav.gallery}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("how-it-works")} className="landing-nav-link">{t.nav.howItWorks}</button>
            <button data-testid="btn-scroll" onClick={() => scrollTo("faq")} className="landing-nav-link">{t.nav.faq}</button>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <button data-testid="btn-toggle-lang" onClick={toggleLanguage} className="landing-language-toggle font-medium">
              {lang === 'ar' ? 'English' : 'العربية'}
            </button>
            {user ? (
              <Link data-testid="link-dashboard" href="/dashboard" className="btn-primary landing-primary-action bg-[#0D1B3D] text-white hover:bg-[#0D1B3D]/90 h-10 text-sm px-6">
                {t.nav.dashboard}
              </Link>
            ) : (
              <>
                <Link data-testid="link-login" href="/login" className="landing-nav-link text-[#0D1B3D] font-semibold">
                  {t.nav.login}
                </Link>
                <Link data-testid="link-register" href="/register" className="btn-primary landing-primary-action bg-[#0D1B3D] text-white hover:bg-[#0D1B3D]/90 h-10 text-sm px-6">
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
             <button data-testid="btn-scroll" onClick={() => scrollTo("features")} className="cursor-pointer text-[#64748B] font-medium text-start py-2 border-b border-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]">{t.nav.features}</button>
             <button data-testid="btn-scroll" onClick={() => scrollTo("gallery")} className="cursor-pointer text-[#64748B] font-medium text-start py-2 border-b border-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]">{t.nav.gallery}</button>
             <button data-testid="btn-scroll" onClick={() => scrollTo("how-it-works")} className="cursor-pointer text-[#64748B] font-medium text-start py-2 border-b border-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]">{t.nav.howItWorks}</button>
             <button data-testid="btn-scroll" onClick={() => scrollTo("faq")} className="cursor-pointer text-[#64748B] font-medium text-start py-2 border-b border-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]">{t.nav.faq}</button>
            <div className="flex flex-col gap-3 mt-2">
               <button data-testid="btn-toggle-lang" onClick={toggleLanguage} className="landing-language-toggle border-b border-gray-100 text-start font-medium">
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
      <section className="relative overflow-hidden bg-[#F7F9FC] pt-24 sm:pt-28 lg:pt-28 lg:min-h-[780px]">
        <div className="absolute inset-x-0 top-0 h-px bg-white"></div>
        <div
          className="pointer-events-none absolute inset-0 hidden opacity-40 sm:block"
          style={{
            backgroundImage:
              "linear-gradient(rgba(15,118,110,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,0.025) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(to bottom, black, transparent 78%)",
          }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -start-40 top-20 hidden h-[520px] w-[520px] rounded-full opacity-70 blur-3xl md:block"
          style={{ background: "radial-gradient(circle, rgba(31,169,184,0.11) 0%, rgba(31,169,184,0) 68%)" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -end-36 bottom-0 hidden h-[460px] w-[460px] rounded-full opacity-50 blur-3xl lg:block"
          style={{ background: "radial-gradient(circle, rgba(13,27,61,0.07) 0%, rgba(13,27,61,0) 70%)" }}
          aria-hidden="true"
        />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 pb-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(370px,0.8fr)] lg:gap-10 lg:pb-12" dir="ltr">
            <div className="order-2 relative min-w-0 lg:order-1 lg:py-4">
              <div
                className="absolute -inset-x-10 -inset-y-14 bg-cover bg-center opacity-[0.14] blur-[1px]"
                style={{ backgroundImage: `url(${getAssetPath("/assets/dental-clinic-bg.jpg")})` }}
                aria-hidden="true"
              ></div>
              <div className="absolute -inset-x-10 -inset-y-14 bg-gradient-to-r from-white/10 via-[#F7F9FC]/35 to-[#F7F9FC]"></div>
              <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-1000">
                <div className="overflow-hidden rounded-xl border border-[#DDE7EC] bg-white p-1.5 shadow-[0_24px_60px_-34px_rgba(13,27,61,0.35)] sm:p-2">
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
              <h1 className={`mb-5 text-[2.2rem] font-bold leading-[1.2] text-[#0D1B3D] sm:text-[2.5rem] animate-in fade-in slide-in-from-bottom-4 duration-700 ${isRTL ? "lg:text-[clamp(3rem,3.35vw,3.375rem)] lg:leading-[1.18]" : "lg:text-[clamp(3rem,3.35vw,3.375rem)] lg:leading-[1.18]"}`}>
                {usesApprovedHeroTitle ? (
                  <>
                    <span className={`block lg:whitespace-nowrap ${isRTL ? "" : "lg:text-2xl lg:leading-[1.3] 2xl:text-[1.8rem]"}`}>{t.hero.titleLine1}</span>
                    <span className={`relative inline-block max-w-full lg:whitespace-nowrap lg:leading-[1.35] ${isRTL ? "lg:text-[clamp(1.75rem,2.05vw,2.15rem)]" : "lg:text-xl 2xl:text-[1.625rem]"}`}>
                      <span className="relative z-10">{t.hero.titleLine2}</span>
                      <span className="absolute inset-x-0 bottom-0.5 -z-0 h-1.5 rounded-full bg-[#1FA9B8]/25" aria-hidden="true"></span>
                    </span>
                  </>
                ) : heroTitle}
              </h1>
              <p className="mx-auto mb-6 max-w-[36rem] text-[15px] leading-7 text-[#64748B] sm:text-base lg:mx-0 lg:max-w-[36rem] animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                {heroSubtitle}
              </p>
               <p className="mx-auto mb-6 max-w-[34rem] text-xs leading-6 text-[#0F766E]/85 sm:text-sm lg:mx-0">
                 {t.hero.credibility}
               </p>
              <div className="flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center lg:justify-start animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
                <Link data-testid="link-register" href="/register" className="btn-primary landing-primary-action h-[52px] w-full bg-[#0D1B3D] px-7 text-base text-white shadow-lg shadow-[#0D1B3D]/15 hover:bg-[#142A59] sm:w-auto">
                  {t.hero.ctaPrimary}
                </Link>
                {supportWhatsappHref ? (
                  <a href={supportWhatsappHref} target="_blank" rel="noopener noreferrer" className="btn-outline landing-whatsapp-action h-[52px] w-full border-[#0D1B3D]/15 bg-white/80 px-6 text-base text-[#0D1B3D] sm:w-auto">
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-b from-transparent to-white/80" aria-hidden="true" />
      </section>
      {/* Clinical Credibility Section */}
      <section id="clinical-credibility" className="relative scroll-mt-24 bg-white py-16 md:py-20">
        <div className="pointer-events-none absolute inset-y-0 start-0 hidden w-[28%] bg-[#F2F7F8]/65 lg:block" aria-hidden="true" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(320px,0.86fr)_minmax(0,1.14fr)] lg:gap-16" dir={isRTL ? "rtl" : "ltr"}>
            <div className="order-1 mx-auto w-full max-w-[500px] lg:mx-0">
              <div className="relative isolate flex min-h-[430px] items-end justify-center overflow-visible sm:min-h-[540px]">
                <div className="absolute inset-x-[9%] bottom-[5%] top-[14%] -z-20 rounded-[46%] bg-[#EAF7F5]" aria-hidden="true" />
                <div className="absolute inset-x-[15%] bottom-[11%] top-[20%] -z-10 rounded-full bg-[#DDF2F3]/75 blur-2xl" aria-hidden="true" />
                <div className="absolute inset-x-[5%] bottom-[3%] top-[9%] -z-10 rounded-full border border-dashed border-[#1FA9B8]/25" aria-hidden="true" />
                <span className="absolute start-[8%] top-[26%] h-2 w-2 rounded-full bg-[#1FA9B8]/35" aria-hidden="true" />
                <span className="absolute end-[10%] top-[17%] h-3 w-3 rounded-full border border-[#0F766E]/25" aria-hidden="true" />
                <span className="absolute end-[4%] top-[47%] h-1.5 w-1.5 rounded-full bg-[#0D1B3D]/20" aria-hidden="true" />
                <img
                  src={getAssetPath("/assets/dr-humam-cutout.png")}
                  alt={lang === "ar" ? "د. همام الكيال" : "Dr. Humam Al-Kayyal"}
                  className="relative z-10 max-h-[620px] w-[94%] object-contain object-bottom drop-shadow-[0_18px_28px_rgba(13,27,61,0.11)] sm:w-[93%]"
                  style={{
                    WebkitMaskImage:
                      "linear-gradient(to bottom, #000 0%, #000 50%, rgba(0,0,0,0.88) 59%, rgba(0,0,0,0.48) 69%, rgba(0,0,0,0.12) 78%, transparent 87%, transparent 100%)",
                    maskImage:
                      "linear-gradient(to bottom, #000 0%, #000 50%, rgba(0,0,0,0.88) 59%, rgba(0,0,0,0.48) 69%, rgba(0,0,0,0.12) 78%, transparent 87%, transparent 100%)",
                  }}
                />
              </div>
            </div>

            <div className="order-2 max-w-3xl">
              <span className="mb-3 block text-sm font-bold uppercase tracking-wider text-[#0F766E]">
                {t.credibility.eyebrow}
              </span>
              <h2 className="mb-6 max-w-2xl text-3xl font-bold leading-tight text-[#0D1B3D] md:text-4xl">
                {t.credibility.title}
              </h2>
              <div className="max-w-2xl space-y-4 text-base leading-8 text-[#64748B] md:text-lg">
                {t.credibility.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="mt-8 grid border-y border-[#0D1B3D]/10 sm:grid-cols-3">
                {t.credibility.items.map((item, index) => (
                  <div
                    key={item.value}
                    className={`py-5 sm:px-5 sm:first:ps-0 sm:last:pe-0 ${index > 0 ? "border-t border-[#0D1B3D]/10 sm:border-t-0 sm:border-s" : ""}`}
                  >
                    <p className="text-xl font-bold leading-snug text-[#0D1B3D]">
                      <bdi dir={item.value.startsWith("+") ? "ltr" : undefined}>{item.value}</bdi>
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[#64748B]">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* Clinical Workflow Section */}
      <section id="clinical-workflow" className="bg-[#F5F8FA] py-20 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="mb-3 block text-sm font-bold uppercase tracking-wider text-[#0F766E]">
              {t.clinical.badge}
            </span>
            <h2 className="mb-4 text-3xl font-bold text-[#0D1B3D] md:text-4xl">
              {t.clinical.title}
            </h2>
            <p className="text-base leading-7 text-[#64748B] md:text-lg">
              {t.clinical.subtitle}
            </p>
          </div>

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <span className="pointer-events-none absolute inset-x-[8%] top-8 hidden h-px bg-[#1FA9B8]/20 xl:block" aria-hidden="true" />
            {t.clinical.items.map((item, index) => (
              <article
                key={item.title}
                className="relative flex min-h-[190px] flex-col border border-[#DDE7EC] bg-white p-5 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-[#1FA9B8]/45"
              >
                <div className="relative z-10 mb-5 flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#1FA9B8]/25 bg-white text-[#0F766E]">
                    <item.icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <bdi dir="ltr" className="text-sm font-bold tracking-[0.16em] text-[#1FA9B8]">
                    {String(index + 1).padStart(2, "0")}
                  </bdi>
                </div>
                <h3 className="mb-2 text-lg font-bold leading-snug text-[#0D1B3D]">
                  {item.title}
                </h3>
                <p className="text-sm leading-6 text-[#64748B]">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>

        </div>
      </section>
      {/* Operational Capabilities */}
      <section id="features" className="scroll-mt-24 bg-white py-16 md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="text-[#0F766E] font-bold text-sm tracking-wider uppercase mb-3 block">{t.features.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-4">{t.features.title}</h2>
            <p className="text-[#64748B] text-base leading-7 md:text-lg">{t.features.subtitle}</p>
          </div>

          <div className="grid grid-cols-1 border-y border-[#0D1B3D]/10 md:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((feature, i) => (
              <article key={feature.title} className={`group bg-white p-6 transition-[background-color,box-shadow] duration-300 hover:bg-[#F9FCFC] hover:shadow-[inset_0_0_0_1px_rgba(31,169,184,0.32)] md:p-7 ${i > 0 ? "border-t border-[#0D1B3D]/10 md:border-t-0" : ""} ${i % 2 === 1 ? "md:border-s" : ""} ${i >= 2 ? "md:border-t lg:border-t-0" : ""} ${i % 3 !== 0 ? "lg:border-s" : "lg:border-s-0"} ${i >= 3 ? "lg:border-t" : ""}`}>
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#ECF8F6] text-[#0F766E] transition-colors duration-300 group-hover:bg-[#0F766E] group-hover:text-white">
                  <feature.icon size={22} strokeWidth={1.8} />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[#0D1B3D]">{feature.title}</h3>
                <p className="text-[15px] leading-7 text-[#64748B]">{feature.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      {/* Gallery Section */}
      <section id="gallery" className="scroll-mt-24 bg-[#0D1B3D] py-16 text-white md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10 md:mb-12">
            <span className="text-[#1FA9B8] font-bold text-sm tracking-wider uppercase mb-3 block">{t.gallery.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">{t.gallery.title}</h2>
            <p className="text-white/70 text-base leading-7 md:text-lg">{t.gallery.subtitle}</p>
          </div>

          {galleryItems[0] && (
            <button
              type="button"
              className="landing-gallery-item group mb-6 block w-full overflow-hidden rounded-xl border border-white/15 bg-white/5 text-start shadow-[0_24px_60px_-36px_rgba(0,0,0,0.75)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA9B8]"
              onClick={() => setLightboxImage(galleryItems[0].img)}
              aria-label={galleryItems[0].title}
            >
              <div className="overflow-hidden bg-white">
                <img
                  src={galleryItems[0].img}
                  alt={galleryItems[0].title}
                  className="aspect-[16/9] w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.015]"
                />
              </div>
              <div className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
                <h3 className="text-lg font-bold text-white sm:text-xl">{galleryItems[0].title}</h3>
                <ImageIcon size={20} className="shrink-0 text-[#1FA9B8]" />
              </div>
            </button>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {galleryItems.slice(1).map((item) => (
              <button
                type="button"
                key={`${item.title}-${item.img}`}
                className="landing-gallery-item group overflow-hidden rounded-lg border border-white/10 bg-white/5 text-start shadow-[0_16px_38px_-30px_rgba(0,0,0,0.7)] transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[#1FA9B8]/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1FA9B8]"
                onClick={() => setLightboxImage(item.img)}
                aria-label={item.title}
              >
                <div className="aspect-[4/3] overflow-hidden bg-white">
                  <img
                    src={item.img}
                    alt={item.title}
                    loading="lazy"
                    className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.025]"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <h3 className="text-base font-bold text-white">{item.title}</h3>
                  <ImageIcon size={17} className="shrink-0 text-[#1FA9B8]" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      {/* How it Works */}
      <section id="how-it-works" className="relative scroll-mt-24 overflow-hidden border-t border-[#DDE7EC] bg-[#F2F7F8] py-16 md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-8 max-w-2xl text-center md:mb-10">
            <span className="mb-2.5 block text-sm font-bold tracking-wider text-[#0F766E] uppercase">{t.howItWorks.badge}</span>
            <h2 className="mb-3 text-3xl font-bold text-[#0D1B3D] md:text-4xl">{t.howItWorks.title}</h2>
            <p className="mx-auto max-w-xl text-base leading-7 text-[#64748B] md:text-lg">{t.howItWorks.subtitle}</p>
          </div>

          <div className="relative mx-auto max-w-[820px]" dir={isRTL ? "rtl" : "ltr"}>
            <span
              className={`pointer-events-none absolute top-8 bottom-8 z-0 w-px bg-[#1FA9B8]/20 ${isRTL ? "right-[42px]" : "left-[42px]"}`}
              aria-hidden="true"
            ></span>
            <div className="relative z-10 space-y-4">
              {t.howItWorks.steps.map((step) => (
                <article
                  key={step.step}
                  className="relative flex items-start gap-4 border-b border-[#0D1B3D]/10 bg-white/55 p-5 text-start first:border-t sm:gap-5 sm:p-6"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#1FA9B8]/25 bg-white text-sm font-bold text-[#0D1B3D]">
                    {step.step}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="mb-2 text-xl font-bold leading-snug text-[#0D1B3D] sm:text-[22px]">{step.title}</h3>
                    <p className="text-[15px] leading-7 text-[#64748B] sm:text-base">{step.desc}</p>
                  </div>
                </article>
              ))}
            </div>
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
      <section id="faq" className="scroll-mt-24 bg-white py-16 md:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-[#0F766E] font-bold text-sm tracking-wider uppercase mb-3 block">{t.faq.badge}</span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0D1B3D] mb-4">{t.faq.title}</h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-4">
            {t.faq.items.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className={`overflow-hidden border bg-white transition-[border-color,background-color] duration-300 ${isOpen ? "border-[#1FA9B8]/45 bg-[#FAFDFD]" : "border-[#DDE7EC] hover:border-[#1FA9B8]/35"}`}>
                  <button
                    className="landing-faq-trigger group w-full px-6 py-5 flex items-center justify-between text-start"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${i}`}
                  >
                    <span className="font-bold text-lg text-[#0D1B3D]">{item.q}</span>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-[#F0F4F6] text-[#0F766E] transition-[transform,background-color,color] duration-300 shrink-0 group-hover:bg-[#0F766E] group-hover:text-white ${isOpen ? 'rotate-180' : ''}`}>
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
      <section className="relative overflow-hidden py-16 md:py-20">
        <div className="absolute inset-0 bg-[#0D1B3D]"></div>
        <div
          className="pointer-events-none absolute inset-0 hidden opacity-60 sm:block"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(circle at center, black, transparent 78%)",
          }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-[#1FA9B8]/55" aria-hidden="true" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 max-w-3xl mx-auto">{t.trial.title}</h2>
          <p className="text-white/80 text-xl mb-10 max-w-2xl mx-auto">{t.trial.subtitle}</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link data-testid="link-register-footer" href="/register" className="btn-primary landing-primary-action bg-[#0F766E] hover:bg-[#0F766E]/90 text-white border-none text-lg h-14 px-8 w-full sm:w-auto shadow-xl">
              {t.trial.cta}
            </Link>
            {supportWhatsappHref ? (
              <a href={supportWhatsappHref} target="_blank" rel="noopener noreferrer" className="btn-outline landing-whatsapp-action landing-whatsapp-action-dark text-lg h-14 px-8 w-full sm:w-auto">
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
      <footer className="border-t border-white/10 bg-[#08142F] pb-7 pt-12 text-white">
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
                <li><button onClick={() => scrollTo("features")} className="landing-footer-link text-white/60">{t.nav.features}</button></li>
                <li><button onClick={() => scrollTo("gallery")} className="landing-footer-link text-white/60">{t.nav.gallery}</button></li>
                <li><button onClick={() => scrollTo("how-it-works")} className="landing-footer-link text-white/60">{t.nav.howItWorks}</button></li>
                <li><button onClick={() => scrollTo("faq")} className="landing-footer-link text-white/60">{t.nav.faq}</button></li>
              </ul>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-6 text-start">{t.footer.contactUs}</h4>
              <ul className="space-y-3 flex flex-col items-start">
                {supportWhatsappHref && (
                  <li>
                    <a href={supportWhatsappHref} target="_blank" rel="noopener noreferrer" className="landing-footer-link text-white/60 flex items-center gap-2">
                      <MessageCircle size={18} />
                      <span dir="ltr">{supportContacts?.whatsapp}</span>
                    </a>
                  </li>
                )}
                {supportPhone && (
                  <li>
                    <a href={`tel:${supportPhone}`} className="landing-footer-link text-white/60 flex items-center gap-2" dir="ltr">
                      <Headset size={18} />
                      {supportPhone}
                    </a>
                  </li>
                )}
                {supportEmail && (
                  <li>
                    <a href={`mailto:${supportEmail}`} className="landing-footer-link text-white/60 flex items-center gap-2 break-all" dir="ltr">
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
              <Link href="/privacy" className="landing-footer-link text-white/40">{t.footer.privacy}</Link>
              <Link href="/terms" className="landing-footer-link text-white/40">{t.footer.terms}</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
