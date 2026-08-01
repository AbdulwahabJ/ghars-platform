import React from "react";
import { Shell } from "@/components/layout/Shell";
import { Info } from "lucide-react";

export default function Finance() {
  return (
    <Shell>
      <div className="flex flex-col items-center justify-center p-12 text-center min-h-[60vh] animate-in fade-in duration-500">
        <div className="h-24 w-24 bg-primary/5 rounded-full flex items-center justify-center mb-8 border border-primary/10">
          <Info className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-4">التقارير المالية</h1>
        <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
          لم يتم تفعيل الوحدة المالية بعد.
          <br />
          ستتوفر التقارير المالية التفصيلية وتتبع الدفعات في مرحلة قادمة.
        </p>
      </div>
    </Shell>
  );
}
