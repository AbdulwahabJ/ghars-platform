import { useLocale } from "@/i18n/LocaleProvider";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { FileText, ArrowLeft, ArrowRight } from "lucide-react";
import gharsSymbol from "@/assets/ghars-symbol.png";

const CONTENT = {
  ar: {
    title: "الشروط والأحكام",
    lastUpdated: "آخر تحديث: 12 سبتمبر 2026",
    sections: [
      {
        title: "1. القبول بالشروط",
        content: "دخولك واستخدامك لمنصة غرس يعني موافقتك الكاملة على هذه الشروط والأحكام. إذا كنت لا توافق على هذه الشروط، يرجى عدم استخدام المنصة."
      },
      {
        title: "2. نموذج الاشتراك والتجربة المجانية",
        content: "توفر غرس تجربة مجانية كاملة لمدة 3 أيام للعيادات الجديدة. لا يوجد اشتراك متجدد تلقائيًا ولا توجد بوابة دفع إلكترونية داخل النظام."
      },
      {
        title: "3. التفعيل التجاري (الدائم)",
        content: "بعد انتهاء فترة التجربة المجانية، يتم تفعيل الحساب بشكل دائم يدوياً من قبل الإدارة بعد التواصل والدفع. بعد التفعيل الدائم، لا يوجد تجديد دوري أو انتهاء صلاحية للاشتراك."
      },
      {
        title: "4. توفر الخدمة",
        content: "نبذل قصارى جهدنا لضمان توفر المنصة بشكل مستمر ومستقر، ولكن لا نضمن خلوها من التوقفات المؤقتة لأغراض الصيانة الدورية أو التحديثات."
      },
      {
        title: "5. مسؤوليات المستخدم",
        content: "يلتزم المستخدم بأن تكون كافة البيانات المدخلة صحيحة وقانونية، ويتحمل مسؤولية الحفاظ على سرية بيانات تسجيل الدخول. يمنع استخدام المنصة لأي غرض غير قانوني، أو رفع أي محتوى خبيث، أو محاولة اختراق الخدمة."
      },
      {
        title: "6. الدعم الفني",
        content: "نقدم الدعم الفني لمستخدمينا لمساعدتهم في حل المشاكل التقنية واستخدام المنصة، وذلك من خلال قنوات التواصل المحددة في النظام."
      },
      {
        title: "7. تعليق الخدمة",
        content: "الاشتراك الدائم لا يمنع تعليق الخدمة في حالات الانتهاكات. تحتفظ غرس بالحق في تعليق وصول العيادة للمنصة لأسباب أمنية، قانونية، تشغيلية، أو في حال رصد أي انتهاك لهذه الشروط والأحكام."
      }
    ],
    back: "العودة للرئيسية",
  },
  en: {
    title: "Terms & Conditions",
    lastUpdated: "Last Updated: 12 September 2026",
    sections: [
      {
        title: "1. Acceptance of Terms",
        content: "By accessing and using the Ghars platform, you agree fully to these terms and conditions. If you do not agree, please do not use the platform."
      },
      {
        title: "2. Subscription Model and Free Trial",
        content: "Ghars provides a full 3-day free trial for new clinics. There is no auto-recurring subscription and no internal electronic payment gateway."
      },
      {
        title: "3. Commercial Activation (Permanent)",
        content: "After the free trial ends, accounts are permanently activated manually by the administration after communication and payment. Once permanently activated, there is no recurring renewal or subscription expiry."
      },
      {
        title: "4. Service Availability",
        content: "We do our best to ensure the continuous and stable availability of the platform, but we do not guarantee it will be free from temporary interruptions for maintenance or updates."
      },
      {
        title: "5. User Responsibilities",
        content: "The user must ensure all entered data is lawful and correct, and is responsible for keeping login credentials secure. The platform may not be used for illegal purposes, uploading malicious content, or attempting to breach the service."
      },
      {
        title: "6. Technical Support",
        content: "We provide technical support to help users resolve technical issues and utilize the platform, through the communication channels specified in the system."
      },
      {
        title: "7. Service Suspension",
        content: "Permanent activation does not prevent service suspension for violations. Ghars reserves the right to suspend access for security, legal, or operational reasons, or if any violation of these terms and conditions is detected."
      }
    ],
    back: "Back to Home",
  }
};

export default function Terms() {
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
              <FileText size={24} />
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
