import React, { useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginInputSchema, LoginInput } from "@workspace/shared";
import { useAuth } from "@/hooks/use-auth";
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
import clinicLogo from "@/assets/clinic-logo.png";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, user, setupStatus, isLoading } = useAuth();
  
  useEffect(() => {
    if (!isLoading) {
      if (setupStatus?.setupRequired) {
        setLocation("/setup");
      } else if (user) {
        setLocation("/");
      }
    }
  }, [user, setupStatus, isLoading, setLocation]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = (data: LoginInput) => {
    login.mutate(data, {
      onSuccess: () => {
        setLocation("/");
      },
    });
  };

  if (isLoading || user) {
    return null; // Don't flash login screen while redirecting
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-lg p-8 relative overflow-hidden">
        {/* Subtle decorative background elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/5 rounded-tr-full pointer-events-none" />
        
        <div className="flex flex-col items-center mb-8 relative z-10">
          <img src={clinicLogo} alt="Clinic Logo" className="h-16 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground text-center">
            تسجيل الدخول
          </h1>
          <p className="text-muted-foreground text-center mt-2 text-sm">
            نظام متابعة زراعة الأسنان – د. همام
          </p>
        </div>

        {login.isError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription className="text-center font-medium">
              {login.error?.message || "بيانات الدخول غير صحيحة."}
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 relative z-10">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المستخدم</FormLabel>
                  <FormControl>
                    <Input placeholder="أدخل اسم المستخدم" {...field} dir="ltr" className="text-right" />
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

            <Button type="submit" className="w-full btn-primary mt-8" disabled={login.isPending}>
              {login.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span>جاري الدخول...</span>
                </>
              ) : (
                <span>تسجيل الدخول</span>
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
