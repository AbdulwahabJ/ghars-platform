import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  loginInputSchema,
  LoginInput,
  passwordResetRequestInputSchema,
  PasswordResetRequestInput,
  completePasswordResetInputSchema,
  CompletePasswordResetInput,
} from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import gharsLogo from "@/assets/ghars-logo.png";
import gharsSymbol from "@/assets/ghars-symbol-transparent.png";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe2,
  Headset,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Extend the reset schema to ensure passwords match on the client side
const resetFormSchema = completePasswordResetInputSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
  message: "كلمة المرور غير متطابقة",
  path: ["confirmPassword"]
  });

type ResetFormInput = z.infer<typeof resetFormSchema>;

export default function Login() {
  const [location, setLocation] = useLocation();
  const { login, user, setupStatus, isLoading } = useAuth();
  
  // Extract token from search params if we're on the reset route
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");
  
  const isResetRoute = location === "/reset-password";
  const [view, setView] = useState<"login" | "forgot">("login");
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [supportMessage, setSupportMessage] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      if (setupStatus?.setupRequired) {
        setLocation("/setup");
      } else if (user) {
        setLocation("/");
      }
    }
  }, [user, setupStatus, isLoading, setLocation]);

  const forgotMutation = useMutation({
    mutationFn: (data: PasswordResetRequestInput) => api.requestPasswordReset(data),
    onSuccess: (res) => {
      setForgotSuccessMsg(res.message || "تم إرسال رابط استعادة كلمة المرور بنجاح.");
    }
  });

  const resetMutation = useMutation({
    mutationFn: (data: CompletePasswordResetInput) => api.completePasswordReset(data),
    onSuccess: () => {
      setResetSuccess(true);
    }
  });

  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { username: "", password: "" },
  });

  const forgotForm = useForm<PasswordResetRequestInput>({
    resolver: zodResolver(passwordResetRequestInputSchema),
    defaultValues: { identifier: "" },
  });

  const resetForm = useForm<ResetFormInput>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { token: token || "", password: "", confirmPassword: "" },
  });

  if (isLoading || user) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-white" dir="rtl">
      
      {/* Right Side Visually (First element in RTL) -> Form */}
      <div className="flex-1 flex flex-col items-center justify-start p-6 pt-28 sm:p-12 sm:pt-28 md:justify-center md:pt-12 relative z-10 bg-white order-2 md:order-1">
        <button
          type="button"
          dir="ltr"
          className="absolute top-8 right-8 inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/30"
          aria-label="اختيار اللغة"
        >
          <Globe2 className="h-[18px] w-[18px]" aria-hidden="true" />
          <span>العربية</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        
        {/* Mobile Header (Hidden on Desktop) */}
        <div className="flex md:hidden flex-col items-center mb-10">
          <img src={gharsLogo} alt="غرس" className="h-20 w-auto object-contain mb-4" />
        </div>

        <div className="w-full max-w-[500px] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {!isResetRoute && view === "login" && (
            <>
              <div className="space-y-2 text-center md:text-right">
                <h1 className="text-4xl font-brand-arabic font-bold tracking-tight text-foreground md:text-[40px]">تسجيل الدخول</h1>
                <p className="text-muted-foreground font-brand-arabic text-base md:text-[17px]">مرحباً بك في منصة غرس</p>
              </div>

              {login.isError && (
                <Alert variant="destructive">
                  <AlertDescription className="font-medium text-sm">
                    {login.error?.message || "بيانات الدخول غير صحيحة."}
                  </AlertDescription>
                </Alert>
              )}

              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit((d) => login.mutate(d))} className="space-y-6">
                  <FormField
                    control={loginForm.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                         <FormLabel className="text-[15px]">اسم المستخدم</FormLabel>
                         <FormControl>
                           <div className="relative">
                             <UserRound
                               className="pointer-events-none absolute right-4 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-slate-400"
                               aria-hidden="true"
                             />
                             <Input
                               placeholder="أدخل اسم المستخدم"
                               {...field}
                               dir="ltr"
                               autoComplete="username"
                               className="h-[56px] rounded-[7px] border-slate-300 pr-12 text-right text-[16px] shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                             />
                           </div>
                         </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                           <FormLabel className="text-[15px]">كلمة المرور</FormLabel>
                          <button 
                            type="button" 
                            onClick={() => {
                              setView("forgot");
                              forgotForm.reset();
                              setForgotSuccessMsg(null);
                            }}
                             className="text-xs font-medium text-[#278f8c] transition-colors hover:underline focus:outline-none"
                          >
                            نسيت كلمة المرور؟
                          </button>
                        </div>
                         <FormControl>
                           <div className="relative">
                             <LockKeyhole
                               className="pointer-events-none absolute right-4 top-1/2 z-10 h-[19px] w-[19px] -translate-y-1/2 text-slate-400"
                               aria-hidden="true"
                             />
                             <Input
                               placeholder="أدخل كلمة المرور"
                               type={showPassword ? "text" : "password"}
                               {...field}
                               dir="ltr"
                               autoComplete="current-password"
                               className="h-[56px] rounded-[7px] border-slate-300 pl-12 pr-12 text-right text-[16px] shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                             />
                             <button
                               type="button"
                               onClick={() => setShowPassword((visible) => !visible)}
                               className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-sm text-slate-400 transition-colors hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/30"
                               aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                             >
                               {showPassword ? (
                                 <EyeOff className="h-[19px] w-[19px]" aria-hidden="true" />
                               ) : (
                                 <Eye className="h-[19px] w-[19px]" aria-hidden="true" />
                               )}
                             </button>
                           </div>
                         </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                   <Button type="submit" className="mt-2 h-[56px] w-full rounded-[7px] bg-brand-navy text-white text-[16px] hover:bg-[#132850]" disabled={login.isPending}>
                    {login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    تسجيل الدخول
                  </Button>
                </form>
              </Form>

               <div className="space-y-4 pt-1">
                 <div className="flex items-center gap-4 text-xs text-slate-400">
                   <span className="h-px flex-1 bg-slate-200" />
                   <span>أو</span>
                   <span className="h-px flex-1 bg-slate-200" />
                 </div>
                 <button
                   type="button"
                   onClick={() => setSupportMessage(true)}
                   className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[7px] border border-[#67b8b4] bg-white text-[15px] font-medium text-brand-navy transition-colors hover:bg-[#f2fbfa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67b8b4]/40"
                 >
                   <Headset className="h-[18px] w-[18px] text-[#5ca8a5]" aria-hidden="true" />
                   تواصل مع الدعم الفني
                 </button>
                 {supportMessage && (
                   <p className="text-center text-xs text-slate-500" role="status">
                     سيتم تفعيل قناة الدعم الفني قريبًا.
                   </p>
                 )}
               </div>

               <div className="flex items-start justify-center gap-2 pt-2 text-center text-slate-400">
                 <ShieldCheck className="mt-0.5 h-[19px] w-[19px] shrink-0 text-[#5aa9a4]" aria-hidden="true" />
                 <div className="space-y-0.5">
                   <p className="text-xs font-medium text-slate-500">بياناتك محمية وآمنة</p>
                   <p className="text-[10px]">نستخدم أحدث تقنيات التشفير لحماية بياناتك</p>
                 </div>
               </div>
            </>
          )}

          {!isResetRoute && view === "forgot" && (
            <>
              <div className="space-y-3 text-center md:text-right">
                <button 
                  onClick={() => setView("login")} 
                  className="mb-6 flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                >
                  <ArrowRight className="ml-1 h-4 w-4" />
                  العودة لتسجيل الدخول
                </button>
                <h1 className="text-3xl font-brand-arabic font-bold tracking-tight text-foreground">استعادة كلمة المرور</h1>
                <p className="text-muted-foreground font-brand-arabic text-sm leading-relaxed">
                  أدخل اسم المستخدم أو البريد الإلكتروني وسنرسل لك رابطاً لإعادة التعيين.
                </p>
              </div>

              {forgotSuccessMsg ? (
                <Alert className="border-primary/20 bg-primary/5">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                  <AlertDescription className="font-medium text-primary ml-2 text-sm leading-relaxed">
                    {forgotSuccessMsg}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  {forgotMutation.isError && (
                    <Alert variant="destructive">
                      <AlertDescription className="font-medium text-sm">
                        {forgotMutation.error?.message || "حدث خطأ أثناء الطلب."}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Form {...forgotForm}>
                    <form onSubmit={forgotForm.handleSubmit((d) => forgotMutation.mutate(d))} className="space-y-5">
                      <FormField
                        control={forgotForm.control}
                        name="identifier"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>اسم المستخدم أو البريد الإلكتروني</FormLabel>
                            <FormControl>
                             <Input
                               placeholder="أدخل بياناتك هنا"
                               {...field}
                               dir="ltr"
                               autoComplete="username"
                               className="h-[52px] rounded-[7px] border-slate-300 text-right shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                             />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                       <Button type="submit" className="mt-2 h-[50px] w-full rounded-[7px] bg-brand-navy text-white hover:bg-[#132850]" disabled={forgotMutation.isPending}>
                        {forgotMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        إرسال رابط الاستعادة
                      </Button>
                    </form>
                  </Form>
                </>
              )}
            </>
          )}

          {isResetRoute && (
            <>
              <div className="space-y-3 text-center md:text-right">
                <h1 className="text-3xl font-brand-arabic font-bold tracking-tight text-foreground">تعيين كلمة مرور جديدة</h1>
                <p className="text-muted-foreground font-brand-arabic text-sm">الرجاء إدخال كلمة المرور الجديدة الخاصة بك.</p>
              </div>

              {resetSuccess ? (
                <div className="space-y-6">
                  <Alert className="border-primary/20 bg-primary/5">
                    <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                    <AlertDescription className="font-medium text-primary ml-2 text-sm leading-relaxed">
                      تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.
                    </AlertDescription>
                  </Alert>
                  <Button onClick={() => setLocation("/login")} className="w-full btn-primary">
                    الذهاب لتسجيل الدخول
                  </Button>
                </div>
              ) : (
                <>
                  {resetMutation.isError && (
                    <Alert variant="destructive">
                      <AlertDescription className="font-medium text-sm">
                        {resetMutation.error?.message || "حدث خطأ أثناء تغيير كلمة المرور."}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Form {...resetForm}>
                    <form onSubmit={resetForm.handleSubmit((d) => resetMutation.mutate(d))} className="space-y-5">
                      <FormField
                        control={resetForm.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>كلمة المرور الجديدة</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="••••••••"
                                type="password"
                                {...field}
                                dir="ltr"
                                autoComplete="new-password"
                                className="h-[52px] rounded-[7px] border-slate-300 text-right shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={resetForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>تأكيد كلمة المرور</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="••••••••"
                                type="password"
                                {...field}
                                dir="ltr"
                                autoComplete="new-password"
                                className="h-[52px] rounded-[7px] border-slate-300 text-right shadow-none focus-visible:border-brand-navy focus-visible:ring-brand-navy/20"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                       <Button type="submit" className="mt-2 h-[50px] w-full rounded-[7px] bg-brand-navy text-white hover:bg-[#132850]" disabled={resetMutation.isPending}>
                        {resetMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        حفظ كلمة المرور
                      </Button>
                    </form>
                  </Form>
                </>
              )}
            </>
          )}

        </div>
      </div>

      {/* Left Side Visually (Second element in RTL) -> Identity panel */}
      <div className="hidden md:flex md:w-[50%] bg-[#f4f7fa] flex-col items-center justify-center p-12 relative overflow-hidden order-1 md:order-2 border-r border-slate-200">
        <div className="absolute left-0 top-0 h-[42%] w-[58%] bg-hex-pattern opacity-80 pointer-events-none" />
        <div className="absolute bottom-0 right-0 h-[44%] w-[62%] bg-hex-pattern opacity-80 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          <img src={gharsSymbol} alt="رمز غرس" className="h-[140px] w-[140px] object-contain" />
          <div className="mt-2 space-y-0">
            <p className="font-brand-arabic text-[62px] font-bold leading-[1.15] text-brand-navy">غرس</p>
            <p className="font-brand-latin text-[56px] font-semibold leading-[1.05] text-brand-navy">Ghars</p>
          </div>
          <div className="mt-7 flex items-center gap-3 text-brand-navy">
            <span className="h-px w-6 bg-brand-navy/60" />
            <p className="font-brand-arabic text-[17px] font-medium">منصة ذكية لإدارة زراعة الأسنان</p>
            <span className="h-px w-6 bg-brand-navy/60" />
          </div>
          <p className="mt-2 font-brand-arabic text-[16px] tracking-[0.18em] text-[#5a769b]">تقنية . دقة . ثقة</p>
        </div>
      </div>
      
    </div>
  );
}
