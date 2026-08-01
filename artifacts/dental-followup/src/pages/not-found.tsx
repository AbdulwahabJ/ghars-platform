import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background" dir="rtl">
      <div className="text-center p-8 bg-card border border-border rounded-2xl shadow-sm max-w-md w-full">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-3">الصفحة غير موجودة</h1>
        <p className="text-muted-foreground mb-8">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <Link href="/" className="btn-primary w-full inline-flex justify-center">
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
