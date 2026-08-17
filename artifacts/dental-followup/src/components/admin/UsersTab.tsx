import { useState } from "react";
import { Loader2, KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import type { AdminUser, UserRole } from "@workspace/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useAdminUsers, useAdminUserMutations } from "@/hooks/use-admin";
import { useAuth } from "@/hooks/use-auth";
import { ME_QUERY_KEY } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { formatSaudiDateTime } from "@/lib/datetime";
import { UserAvatar, AvatarUploader } from "@/components/ui/user-avatar";

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "مدير النظام",
  DOCTOR: "طبيب",
  ASSISTANT: "مساعد",
};

/** Tri-state override: null = role default. */
function overrideToSelect(v: boolean | null): string {
  return v === null ? "default" : v ? "yes" : "no";
}
function selectToOverride(v: string): boolean | null {
  return v === "default" ? null : v === "yes";
}

interface UserFormState {
  username: string;
  fullName: string;
  role: UserRole;
  password: string;
  canViewFinancials: string;
  canRecordPayments: string;
  avatarData: string | null;
}

const EMPTY_FORM: UserFormState = {
  username: "",
  fullName: "",
  role: "ASSISTANT",
  password: "",
  canViewFinancials: "default",
  canRecordPayments: "default",
  avatarData: null,
};

export function UsersTab() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminUsers();
  const { create, update, setActive, resetPassword } = useAdminUserMutations();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<Omit<
    UserFormState,
    "username" | "password"
  > | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fail = (err: unknown) =>
    toast({
      variant: "destructive",
      title: "تعذر تنفيذ العملية",
      description: err instanceof ApiError ? err.message : "حدث خطأ غير متوقع.",
    });

  const avatarError = (msg: string) =>
    toast({ variant: "destructive", title: "صورة الملف الشخصي", description: msg });

  const submitCreate = () => {
    create.mutate(
      {
        username: form.username,
        fullName: form.fullName,
        role: form.role,
        password: form.password,
        canViewFinancials: selectToOverride(form.canViewFinancials),
        canRecordPayments: selectToOverride(form.canRecordPayments),
        avatarData: form.avatarData ?? undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "تم إنشاء المستخدم بنجاح." });
          setCreateOpen(false);
          setForm(EMPTY_FORM);
        },
        onError: fail,
      },
    );
  };

  const submitEdit = () => {
    if (!editUser || !editForm) return;

    // Determine if avatar changed vs original to send only what changed.
    const avatarChanged = editForm.avatarData !== editUser.avatarData;

    update.mutate(
      {
        id: editUser.id,
        input: {
          fullName: editForm.fullName,
          role: editForm.role,
          canViewFinancials: selectToOverride(editForm.canViewFinancials),
          canRecordPayments: selectToOverride(editForm.canRecordPayments),
          ...(avatarChanged ? { avatarData: editForm.avatarData } : {}),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "تم حفظ التعديلات." });
          setEditUser(null);
          // If the admin updated their own profile, refresh the auth user so
          // the header/hero reflect the new avatar immediately.
          if (editUser.id === me?.id) {
            queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
          }
        },
        onError: fail,
      },
    );
  };

  const submitReset = () => {
    if (!resetUser) return;
    resetPassword.mutate(
      { id: resetUser.id, input: { password: newPassword } },
      {
        onSuccess: () => {
          toast({
            title: "تمت إعادة تعيين كلمة المرور.",
            description:
              "تم إنهاء جلسات المستخدم الحالية وسيحتاج لتسجيل الدخول من جديد.",
          });
          setResetUser(null);
          setNewPassword("");
        },
        onError: fail,
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const users = data?.users ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>إدارة المستخدمين</CardTitle>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="button-create-user"
        >
          <Plus className="h-4 w-4 ml-1" />
          <span>مستخدم جديد</span>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم الكامل</TableHead>
                <TableHead className="text-right">اسم المستخدم</TableHead>
                <TableHead className="text-right">الدور</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">عرض المالية</TableHead>
                <TableHead className="text-right">تسجيل دفعات</TableHead>
                <TableHead className="text-right">آخر دخول</TableHead>
                <TableHead className="text-right">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`row-user-${u.username}`}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        fullName={u.fullName}
                        avatarData={u.avatarData}
                        size="sm"
                      />
                      <span>{u.fullName}</span>
                    </div>
                  </TableCell>
                  <TableCell dir="ltr" className="text-right">
                    {u.username}
                  </TableCell>
                  <TableCell>{ROLE_LABELS[u.role]}</TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <Badge variant="secondary">نشط</Badge>
                    ) : (
                      <Badge variant="destructive">موقوف</Badge>
                    )}
                  </TableCell>
                  <TableCell>{u.canViewFinancials ? "نعم" : "لا"}</TableCell>
                  <TableCell>{u.canRecordPayments ? "نعم" : "لا"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {u.lastLoginAt ? formatSaudiDateTime(u.lastLoginAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditUser(u);
                          setEditForm({
                            fullName: u.fullName,
                            role: u.role,
                            canViewFinancials: overrideToSelect(
                              u.canViewFinancialsOverride,
                            ),
                            canRecordPayments: overrideToSelect(
                              u.canRecordPaymentsOverride,
                            ),
                            avatarData: u.avatarData ?? null,
                          });
                        }}
                        data-testid={`button-edit-${u.username}`}
                      >
                        تعديل
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setResetUser(u)}
                        title="إعادة تعيين كلمة المرور"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      {u.id !== me?.id && (
                        <Button
                          variant={u.isActive ? "destructive" : "secondary"}
                          size="sm"
                          onClick={() =>
                            setActive.mutate(
                              { id: u.id, active: !u.isActive },
                              {
                                onSuccess: () =>
                                  toast({
                                    title: u.isActive
                                      ? "تم إيقاف المستخدم وإنهاء جلساته."
                                      : "تمت إعادة تفعيل المستخدم.",
                                  }),
                                onError: fail,
                              },
                            )
                          }
                          data-testid={`button-toggle-${u.username}`}
                        >
                          {u.isActive ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                          <span className="notranslate">
                            {u.isActive ? "إيقاف" : "تفعيل"}
                          </span>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          لا يمكن حذف المستخدمين حفاظًا على السجلات التاريخية — يمكن إيقافهم
          فقط. إيقاف المستخدم يمنع دخوله فورًا مع بقاء جميع سجلاته ظاهرة.
        </p>
      </CardContent>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Avatar */}
            <div className="space-y-2">
              <Label>صورة المستخدم</Label>
              <AvatarUploader
                value={form.avatarData}
                onChange={(v) => setForm({ ...form, avatarData: v })}
                onError={avatarError}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-username">اسم المستخدم (للدخول)</Label>
              <Input
                id="new-username"
                dir="ltr"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                data-testid="input-new-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-fullname">الاسم الكامل</Label>
              <Input
                id="new-fullname"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                data-testid="input-new-fullname"
              />
            </div>
            <div className="space-y-2">
              <Label>الدور</Label>
              <Select
                dir="rtl"
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole })}
              >
                <SelectTrigger data-testid="select-new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">مدير النظام</SelectItem>
                  <SelectItem value="DOCTOR">طبيب</SelectItem>
                  <SelectItem value="ASSISTANT">مساعد</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور المؤقتة</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                data-testid="input-new-password"
              />
              <p className="text-xs text-muted-foreground">
                12 خانة على الأقل وتتضمن حرفًا ورقمًا.
              </p>
            </div>
            <PermissionSelects
              view={form.canViewFinancials}
              pay={form.canRecordPayments}
              onView={(v) => setForm({ ...form, canViewFinancials: v })}
              onPay={(v) => setForm({ ...form, canRecordPayments: v })}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={submitCreate}
              disabled={create.isPending}
              data-testid="button-submit-create-user"
            >
              {create.isPending && (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              )}
              <span>إنشاء المستخدم</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editUser}
        onOpenChange={(open) => !open && setEditUser(null)}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل المستخدم {editUser?.fullName}</DialogTitle>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              {/* Avatar */}
              <div className="space-y-2">
                <Label>صورة المستخدم</Label>
                <AvatarUploader
                  value={editForm.avatarData}
                  onChange={(v) => setEditForm({ ...editForm, avatarData: v })}
                  onError={avatarError}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-fullname">الاسم الكامل</Label>
                <Input
                  id="edit-fullname"
                  value={editForm.fullName}
                  onChange={(e) =>
                    setEditForm({ ...editForm, fullName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>الدور</Label>
                <Select
                  dir="rtl"
                  value={editForm.role}
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, role: v as UserRole })
                  }
                >
                  <SelectTrigger data-testid="select-edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">مدير النظام</SelectItem>
                    <SelectItem value="DOCTOR">طبيب</SelectItem>
                    <SelectItem value="ASSISTANT">مساعد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <PermissionSelects
                view={editForm.canViewFinancials}
                pay={editForm.canRecordPayments}
                onView={(v) =>
                  setEditForm({ ...editForm, canViewFinancials: v })
                }
                onPay={(v) => setEditForm({ ...editForm, canRecordPayments: v })}
              />
              <p className="text-xs text-muted-foreground">
                تسري تعديلات الصلاحيات فورًا على جلسات المستخدم الحالية.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={submitEdit}
              disabled={update.isPending}
              data-testid="button-submit-edit-user"
            >
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              )}
              <span>حفظ التعديلات</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={!!resetUser}
        onOpenChange={(open) => {
          if (!open) {
            setResetUser(null);
            setNewPassword("");
          }
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              إعادة تعيين كلمة مرور {resetUser?.fullName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">كلمة المرور الجديدة</Label>
            <Input
              id="reset-password"
              type="password"
              dir="ltr"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              data-testid="input-reset-password"
            />
            <p className="text-xs text-muted-foreground">
              سيتم إنهاء جلسات المستخدم الحالية بعد إعادة التعيين.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={submitReset}
              disabled={resetPassword.isPending}
              data-testid="button-submit-reset-password"
            >
              {resetPassword.isPending && (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              )}
              <span>إعادة التعيين</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PermissionSelects({
  view,
  pay,
  onView,
  onPay,
}: {
  view: string;
  pay: string;
  onView: (v: string) => void;
  onPay: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>عرض البيانات المالية</Label>
        <Select dir="rtl" value={view} onValueChange={onView}>
          <SelectTrigger data-testid="select-perm-view">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">حسب الدور (افتراضي)</SelectItem>
            <SelectItem value="yes">مسموح</SelectItem>
            <SelectItem value="no">ممنوع</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>تسجيل الدفعات</Label>
        <Select dir="rtl" value={pay} onValueChange={onPay}>
          <SelectTrigger data-testid="select-perm-pay">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">حسب الدور (افتراضي)</SelectItem>
            <SelectItem value="yes">مسموح</SelectItem>
            <SelectItem value="no">ممنوع</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
