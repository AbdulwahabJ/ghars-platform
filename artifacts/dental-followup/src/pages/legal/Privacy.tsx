import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ShieldCheck, ArrowLeft, ArrowRight } from "lucide-react";
import gharsSymbol from "@/assets/ghars-symbol.png";

const CONTENT = {
  ar: {
    title: "سياسة الخصوصية",
    lastUpdated: "آخر تحديث: 12 سبتمبر 2026",
    sections: [
      {
        title: "1. جمع المعلومات",
        content: "نحن نجمع معلومات عنك عندما تقوم بالتسجيل في غرس، أو عند استخدامك لمنصتنا السحابية. المعلومات التي نجمعها تشمل البيانات التي تقدمها طواعية، بالإضافة إلى بيانات عن استخدامك للمنصة لضمان تحسين مستمر لجودة الخدمة."
      },
      {
        title: "2. بيانات العيادة والمرضى",
        content: "تُدار بيانات العيادات ضمن نطاقات وصول منفصلة بحسب المنشأة والصلاحيات. لا نبيع بيانات المرضى المدخلة في النظام أو نستخدمها لأغراض إعلانية. تتحمل العيادة مسؤولية مشروعية إدخال البيانات وإدارة صلاحيات الوصول إليها."
      },
      {
        title: "3. أمان وحماية البيانات",
        content: "نستخدم ضوابط تقنية وإدارية معقولة للمساعدة في حماية البيانات من الوصول أو التعديل أو الإفصاح غير المصرح به. لا توجد وسيلة إلكترونية خالية تماماً من المخاطر، لذلك لا نقدم ضماناً مطلقاً للأمان."
      },
      {
        title: "4. التزامات المستخدم",
        content: "بصفتك مستخدماً لمنصة غرس، فإنك توافق على استخدام النظام وفقاً للغرض المخصص له، وعدم إساءة استخدام الخدمة أو محاولة الوصول إلى حسابات وموارد لا تملك صلاحية الوصول إليها."
      },
      {
        title: "5. التواصل والدعم",
        content: "إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل مع فريق الدعم الفني لغرس عبر قنوات الاتصال المعتمدة في النظام."
      }
    ],
    back: "العودة للرئيسية",
  },
  en: {
    title: "Privacy Policy",
    lastUpdated: "Last Updated: 12 September 2026",
    sections: [
      {
        title: "1. Information Collection",
        content: "We collect information about you when you register on Ghars or when using our cloud platform. Information we collect includes voluntarily provided data and usage data to ensure continuous service improvement."
      },
      {
        title: "2. Clinic and Patient Data",
        content: "Clinic data is managed within separate access scopes based on the facility and assigned permissions. We do not sell patient data entered into the system or use it for advertising. The clinic is responsible for lawful data entry and for managing access permissions."
      },
      {
        title: "3. Data Security and Protection",
        content: "We use reasonable technical and administrative safeguards to help protect data from unauthorized access, alteration, or disclosure. No electronic system is entirely risk-free, so we do not provide an absolute security guarantee."
      },
      {
        title: "4. User Responsibilities",
        content: "As a Ghars user, you agree to use the system in accordance with its intended purpose, and not to misuse the service or attempt to access accounts and resources you do not have permission to access."
      },
      {
        title: "5. Contact and Support",
        content: "If you have any questions about this Privacy Policy, please contact the Ghars technical support team through our official communication channels."
      }
    ],
    back: "Back to Home",
  }
};

export default function Privacy() {
  const { direction } = useLocale();
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const t = CONTENT[lang as 'ar' | 'en'] || CONTENT['ar'];
  const isRTL = direction === 'rtl';

  return (
    <div className={`min-h-screen bg-background font-sans ${isRTL ? "font-brand-arabic" : "font-brand-latin"}`} dir={direction}>
      <header className="bg-white border-b border-border py-4">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2" dir="ltr">
            <span className="notranslate inline-flex items-baseline whitespace-nowrap text-[#0D1B3D] font-semibold text-xl tracking-tight">
              <span dir="rtl" className="font-brand-arabic">غرس</span>
              <span className="mx-1 text-[#64748B]">|</span>
              <span className="font-brand-latin text-[0.9em]">Ghars</span>
            </span>
            <img src={gharsSymbol} alt="Ghars" className="w-8 h-8 object-contain" />
          </Link>
          <Link href="/" className="text-[#64748B] hover:text-[#0D1B3D] inline-flex items-center gap-2 font-medium transition-colors">
            {isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
            <span>{t.back}</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 max-w-4xl">
        <div className="bg-white rounded-2xl p-8 md:p-12 shadow-sm border border-border">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-[#ECF8F6] text-[#0F766E] rounded-xl flex items-center justify-center shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#0D1B3D]">{t.title}</h1>
              <p className="text-[#64748B] mt-1">{t.lastUpdated}</p>
            </div>
          </div>

          <div className="space-y-8 text-[#1E293B]">
            {t.sections.map((section, idx) => (
              <section key={idx}>
                <h2 className="text-xl font-bold text-[#0D1B3D] mb-3">{section.title}</h2>
                <p className="leading-relaxed text-[#64748B]">{section.content}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
