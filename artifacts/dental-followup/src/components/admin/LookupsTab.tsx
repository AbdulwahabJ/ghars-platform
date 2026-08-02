import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  ADMIN_LOOKUP_CATEGORIES,
  ADMIN_LOOKUP_CATEGORY_LABELS,
  type AdminLookupCategory,
  type AdminLookupOption,
} from "@workspace/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAdminLookups, useAdminLookupMutations } from "@/hooks/use-admin";
import { ApiError } from "@/lib/api";

export function LookupsTab() {
  const { data, isLoading } = useAdminLookups();
  const { create, update, setActive, remove, reorder } =
    useAdminLookupMutations();
  const { toast } = useToast();

  const [category, setCategory] = useState<AdminLookupCategory>(
    "implant_system",
  );
  const [newValue, setNewValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const options = useMemo(
    () =>
      (data?.options ?? [])
        .filter((o) => o.category === category)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [data, category],
  );

  const fail = (err: unknown) =>
    toast({
      variant: "destructive",
      title: "تعذر تنفيذ العملية",
      description: err instanceof ApiError ? err.message : "حدث خطأ غير متوقع.",
    });

  const addOption = () => {
    if (!newValue.trim()) return;
    create.mutate(
      { category, value: newValue.trim() },
      {
        onSuccess: () => {
          toast({ title: "تمت إضافة الخيار." });
          setNewValue("");
        },
        onError: fail,
      },
    );
  };

  const saveRename = (option: AdminLookupOption) => {
    if (!editingValue.trim() || editingValue.trim() === option.value) {
      setEditingId(null);
      return;
    }
    update.mutate(
      { category, id: option.id, input: { value: editingValue.trim() } },
      {
        onSuccess: () => {
          toast({
            title: "تمت إعادة التسمية.",
            description: "السجلات التاريخية تحتفظ بالقيمة القديمة كما هي.",
          });
          setEditingId(null);
        },
        onError: fail,
      },
    );
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const ids = options.map((o) => o.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ category, orderedIds: ids }, { onError: fail });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إدارة القوائم المنسدلة</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="space-y-2 w-full sm:w-64">
            <span className="text-sm font-medium">الفئة</span>
            <Select
              dir="rtl"
              value={category}
              onValueChange={(v) => setCategory(v as AdminLookupCategory)}
            >
              <SelectTrigger data-testid="select-lookup-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_LOOKUP_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ADMIN_LOOKUP_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 flex-1">
            <Input
              placeholder="قيمة جديدة…"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addOption()}
              data-testid="input-new-lookup"
            />
            <Button
              onClick={addOption}
              disabled={create.isPending}
              data-testid="button-add-lookup"
            >
              <Plus className="h-4 w-4 ml-1" />
              <span>إضافة</span>
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right w-24">الترتيب</TableHead>
              <TableHead className="text-right">القيمة</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  لا توجد خيارات في هذه الفئة بعد.
                </TableCell>
              </TableRow>
            )}
            {options.map((o, i) => (
              <TableRow key={o.id} data-testid={`row-lookup-${o.id}`}>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                      title="تحريك لأعلى"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={i === options.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                      title="تحريك لأسفل"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="font-medium">
                  {editingId === o.id ? (
                    <Input
                      autoFocus
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveRename(o)}
                      onBlur={() => saveRename(o)}
                      className="max-w-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => {
                        setEditingId(o.id);
                        setEditingValue(o.value);
                      }}
                      title="اضغط لإعادة التسمية"
                    >
                      {o.value}
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {o.isActive ? (
                      <Badge variant="secondary">نشط</Badge>
                    ) : (
                      <Badge variant="outline">موقوف</Badge>
                    )}
                    {o.isReferenced && (
                      <Badge variant="outline" title="توجد سجلات تاريخية تستخدم هذه القيمة">
                        مستخدم في سجلات
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActive.mutate(
                          { category, id: o.id, active: !o.isActive },
                          { onError: fail },
                        )
                      }
                      data-testid={`button-toggle-lookup-${o.id}`}
                    >
                      <span className="notranslate">
                        {o.isActive ? "إيقاف" : "تفعيل"}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={o.isReferenced}
                      title={
                        o.isReferenced
                          ? "لا يمكن الحذف لوجود سجلات تستخدم هذه القيمة — يمكن إيقافها بدلًا من ذلك."
                          : "حذف"
                      }
                      onClick={() =>
                        remove.mutate(
                          { category, id: o.id },
                          {
                            onSuccess: () => toast({ title: "تم حذف الخيار." }),
                            onError: fail,
                          },
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          إيقاف الخيار يخفيه من القوائم الجديدة فقط — السجلات القديمة تبقى كما
          هي. الحذف متاح فقط للخيارات غير المستخدمة في أي سجل.
        </p>
      </CardContent>
    </Card>
  );
}
