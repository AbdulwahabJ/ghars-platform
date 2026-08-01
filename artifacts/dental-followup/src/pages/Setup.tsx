import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { setupInputSchema, SetupInput } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
import { z } from "zod";
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
import { useToast } from "@/hooks/use-toast";
import clinicLogo from "@/assets/clinic-logo.png";
import { Loader2 } from "lucide-react";

// Extend schema for password confirmation
const setupFormSchema = setupInputSchema.extend({
  confirmPassword: z.string()
}).refine((data: any) => data.password === data.confirmPassword, {
  message: "كلمة المرور غير متطابقة",
  path: ["confirmPassword"],
});

type SetupFormValues = z.infer<typeof setupFormSchema>;

export default function Setup() {
  const [, setLocation] = useLocation();
  const { setup } = useAuth();
  const { toast } = useToast();
  
  const form = useForm<SetupFormValues>({
    resolver: zodResolver(setupFormSchema),
    defaultValues: {
      setupKey: "",
      username: "",
      fullName: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (data: SetupFormValues) => {
    const { confirmPassword, ...setupData } = data;
    setup.mutate(setupData, {
      onSuccess: () => {
        toast({
          title: "تم الإعداد بنجاح",
          description: "يمكنك الآن تسجيل الدخول باستخدام حسابك.",
        });
        setLocation("/login");
      },
      onError: (error: any) => {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: error.message || "حدث خطأ أثناء الإعداد.",
        });
      },
    });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 relative overflow-hidden">
        {/* Subtle decorative background elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/5 rounded-tr-full pointer-events-none" />
        
        <div className="flex flex-col items-center mb-8 relative z-10">
          <img src={clinicLogo} alt="Clinic Logo" className="h-16 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground text-center">
            إعداد النظام لأول مرة
          </h1>
          <p className="text-muted-foreground text-center mt-2 text-sm">
            نظام متابعة زراعة الأسنان – د. همام
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 relative z-10">
            <FormField
              control={form.control}
              name="setupKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>مفتاح الإعداد</FormLabel>
                  <FormControl>
                    <Input placeholder="أدخل مفتاح الإعداد السري" type="password" {...field} dir="ltr" className="text-right" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم الكامل</FormLabel>
                  <FormControl>
                    <Input placeholder="الاسم الكامل" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المستخدم (بالإنجليزية)</FormLabel>
                  <FormControl>
                    <Input placeholder="username" {...field} dir="ltr" className="text-right" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>كلمة المرور</FormLabel>
                  <FormControl>
                    <Input placeholder="••••••••" type="password" {...field} dir="ltr" className="text-right" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>تأكيد كلمة المرور</FormLabel>
                  <FormControl>
                    <Input placeholder="••••••••" type="password" {...field} dir="ltr" className="text-right" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full btn-primary mt-6" disabled={setup.isPending}>
              {setup.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>جاري الإعداد...</span>
                </>
              ) : (
                <span>إتمام الإعداد</span>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
