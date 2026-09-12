import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Edit, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Image as ImageIcon, Check
} from "lucide-react";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useAdminLandingMedia,
  useCreateLandingMedia,
  useUpdateLandingMedia,
  useSetLandingMediaStatus,
  useDeleteLandingMedia,
  useReorderLandingMedia,
  useRequestLandingMediaUploadUrl,
  useReplaceLandingMedia
} from "@/hooks/use-landing-media";
import { LandingMediaAdmin } from "@workspace/shared";

export default function LandingContent() {
  const { t } = useTranslation();
  const { direction } = useLocale();
  const isRTL = direction === 'rtl';
  const { toast } = useToast();

  const { data, isLoading } = useAdminLandingMedia();
  const createMedia = useCreateLandingMedia();
  const updateMedia = useUpdateLandingMedia();
  const setStatus = useSetLandingMediaStatus();
  const deleteMedia = useDeleteLandingMedia();
  const reorderMedia = useReorderLandingMedia();
  const requestUrl = useRequestLandingMediaUploadUrl();
  const replaceMedia = useReplaceLandingMedia();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingMedia, setEditingMedia] = useState<LandingMediaAdmin | null>(null);
  const [isReplacing, setIsReplacing] = useState(false);

  // Form State
  const [file, setFile] = useState<File | null>(null);
  const [titleAr, setTitleAr] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descAr, setDescAr] = useState("");
  const [descEn, setDescEn] = useState("");
  const [mediaType, setMediaType] = useState<"HERO" | "GALLERY">("GALLERY");
  const [isActive, setIsActive] = useState(true);

  const heroMediaList = (data?.media.filter(m => m.mediaType === "HERO") || []).sort((a, b) => a.sortOrder - b.sortOrder);
  const galleryMedia = (data?.media.filter(m => m.mediaType === "GALLERY") || []).sort((a, b) => a.sortOrder - b.sortOrder);

  const resetForm = () => {
    setFile(null);
    setTitleAr("");
    setTitleEn("");
    setDescAr("");
    setDescEn("");
    setMediaType("GALLERY");
    setIsActive(true);
    setEditingMedia(null);
    setIsReplacing(false);
    setIsFormOpen(false);
  };

  const openNewForm = (type: "HERO" | "GALLERY") => {
    resetForm();
    setMediaType(type);
    setIsFormOpen(true);
  };

  const openEditForm = (media: LandingMediaAdmin, replacing: boolean = false) => {
    resetForm();
    setEditingMedia(media);
    setTitleAr(media.titleAr);
    setTitleEn(media.titleEn);
    setDescAr(media.descriptionAr || "");
    setDescEn(media.descriptionEn || "");
    setMediaType(media.mediaType);
    setIsActive(media.isActive);
    setIsReplacing(replacing);
    setIsFormOpen(true);
  };

  const handleUploadFile = async (f: File) => {
    if (f.size > 10 * 1024 * 1024) {
      throw new Error("File exceeds 10MB limit.");
    }
    const contentType = f.type as "image/png" | "image/jpeg" | "image/webp";
    if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
      throw new Error("Invalid file type. Only PNG, JPEG, WebP allowed.");
    }

    const res = await requestUrl.mutateAsync({
      name: f.name,
      size: f.size,
      contentType
    });

    const uploadResponse = await fetch(res.uploadURL, {
      method: "PUT",
      body: f,
      headers: { "Content-Type": contentType },
    });

    if (!uploadResponse.ok) {
      throw new Error(isRTL ? "فشل رفع الصورة" : "Failed to upload image.");
    }

    return { fileRef: res.objectPath, mimeType: contentType, sizeBytes: f.size };
  };

  const handleSave = async () => {
    try {
      if (editingMedia && !isReplacing) {
        // Just updating text and possibly placement
        const newSortOrder = mediaType === editingMedia.mediaType 
            ? editingMedia.sortOrder 
            : (mediaType === "HERO" ? 0 : galleryMedia.length);

        await updateMedia.mutateAsync({
          id: editingMedia.id,
          input: {
            titleAr,
            titleEn,
            descriptionAr: descAr || null,
            descriptionEn: descEn || null,
            mediaType,
            sortOrder: newSortOrder,
          }
        });
        toast({ title: isRTL ? "تم التحديث بنجاح" : "Updated successfully" });
        resetForm();
        return;
      }

      if (isReplacing && !file) {
        toast({ title: isRTL ? "الرجاء اختيار صورة" : "Please select an image", variant: "destructive" });
        return;
      }

      if (!file && !editingMedia) {
        toast({ title: isRTL ? "الرجاء اختيار صورة" : "Please select an image", variant: "destructive" });
        return;
      }

      let uploadData = null;
      if (file) {
        uploadData = await handleUploadFile(file);
      }

      if (editingMedia && isReplacing && uploadData) {
        await replaceMedia.mutateAsync({
          id: editingMedia.id,
          input: {
            sourceType: "OBJECT",
            fileRef: uploadData.fileRef,
            mimeType: uploadData.mimeType,
            sizeBytes: uploadData.sizeBytes,
          }
        });
        toast({ title: isRTL ? "تم استبدال الصورة بنجاح" : "Image replaced successfully" });
      } else if (!editingMedia && uploadData) {
        await createMedia.mutateAsync({
          titleAr,
          titleEn,
          descriptionAr: descAr || null,
          descriptionEn: descEn || null,
          mediaType,
          sortOrder: mediaType === "HERO" ? 0 : galleryMedia.length,
          isActive,
          sourceType: "OBJECT",
          fileRef: uploadData.fileRef,
          mimeType: uploadData.mimeType,
          sizeBytes: uploadData.sizeBytes,
        });
        toast({ title: isRTL ? "تمت الإضافة بنجاح" : "Added successfully" });
      }

      resetForm();
    } catch (e: any) {
      toast({ title: isRTL ? "حدث خطأ" : "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(isRTL ? "هل أنت متأكد من الحذف؟" : "Are you sure you want to delete?")) {
      await deleteMedia.mutateAsync(id);
      toast({ title: isRTL ? "تم الحذف بنجاح" : "Deleted successfully" });
    }
  };

  const toggleStatus = async (id: string, active: boolean) => {
    await setStatus.mutateAsync({ id, input: { isActive: active } });
  };

  const moveOrder = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === galleryMedia.length - 1) return;

    const newItems = [...galleryMedia];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    await reorderMedia.mutateAsync({
      mediaType: "GALLERY",
      orderedIds: newItems.map(m => m.id)
    });
  };

  if (isLoading) return <div className="p-8">{isRTL ? "جاري التحميل..." : "Loading..."}</div>;

  const renderMediaCard = (media: LandingMediaAdmin, isGallery = false, index = 0) => {
    const imageUrl = media.sourceType === "OBJECT"
      ? `/api/platform-admin/landing-media/${media.id}/file?v=${encodeURIComponent(media.updatedAt)}`
      : media.fileRef;

    return (
      <div key={media.id} className="bg-white rounded-lg border p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex w-full sm:w-auto items-center gap-4">
          <div className="w-32 h-24 bg-gray-100 rounded-md overflow-hidden shrink-0 flex items-center justify-center border">
            <img src={imageUrl} alt={media.titleEn} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0 sm:hidden">
            <h4 className="font-semibold text-brand-navy truncate">{isRTL ? media.titleAr : media.titleEn}</h4>
            <p className="text-sm text-slate-500 truncate">{isRTL ? media.titleEn : media.titleAr}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${media.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {media.isActive ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0 hidden sm:block">
          <h4 className="font-semibold text-brand-navy truncate">{isRTL ? media.titleAr : media.titleEn}</h4>
          <p className="text-sm text-slate-500 truncate">{isRTL ? media.titleEn : media.titleAr}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${media.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {media.isActive ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap mt-2 sm:mt-0">
          {isGallery && (
            <div className="flex gap-1 mr-2 rtl:mr-0 rtl:ml-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => moveOrder(index, 'up')} aria-label={isRTL ? 'تحريك لأعلى' : 'Move up'} data-testid={`btn-move-up-${media.id}`}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === galleryMedia.length - 1} onClick={() => moveOrder(index, 'down')} aria-label={isRTL ? 'تحريك لأسفل' : 'Move down'} data-testid={`btn-move-down-${media.id}`}>
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(media.id, !media.isActive)} title={media.isActive ? (isRTL ? 'إلغاء التفعيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')} aria-label={media.isActive ? (isRTL ? 'إلغاء التفعيل' : 'Deactivate') : (isRTL ? 'تفعيل' : 'Activate')} data-testid={`btn-toggle-status-${media.id}`}>
            {media.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(media)} title={isRTL ? 'تعديل النصوص' : 'Edit Text'} aria-label={isRTL ? 'تعديل النصوص' : 'Edit Text'} data-testid={`btn-edit-${media.id}`}>
            <Edit className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(media, true)} title={isRTL ? 'استبدال الصورة' : 'Replace Image'} aria-label={isRTL ? 'استبدال الصورة' : 'Replace Image'} data-testid={`btn-replace-${media.id}`}>
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(media.id)} title={isRTL ? 'حذف' : 'Delete'} aria-label={isRTL ? 'حذف' : 'Delete'} data-testid={`btn-delete-${media.id}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-brand-navy">
            {isRTL ? "محتوى الصفحة التعريفية" : "Landing Page Content"}
          </h2>
          <p className="text-slate-500 mt-1">
            {isRTL ? "إدارة الصور واللقطات في الصفحة الرئيسية." : "Manage Hero and Gallery images."}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2 border-slate-200">
          <h3 className="text-lg font-semibold">
            {isRTL ? "صورة الغلاف (Hero)" : "Hero Image"}
          </h3>
          <Button size="sm" onClick={() => openNewForm("HERO")} className="bg-brand-navy" data-testid="btn-add-hero">
            <Plus className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" />
            {isRTL ? "إضافة" : "Add"}
          </Button>
        </div>
        <div className="space-y-3">
          {heroMediaList.length > 0 ? (
            heroMediaList.map((m, i) => renderMediaCard(m, false, i))
          ) : (
            <div className="text-center p-8 bg-slate-50 border rounded-lg text-slate-500">
              {isRTL ? "لا توجد صورة غلاف. سيتم استخدام الصورة الافتراضية." : "No Hero image. Default will be used."}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b pb-2 border-slate-200">
          <h3 className="text-lg font-semibold">
            {isRTL ? "لقطات النظام (Gallery)" : "Product Screenshots"}
          </h3>
          <Button size="sm" onClick={() => openNewForm("GALLERY")} className="bg-brand-navy" data-testid="btn-add-gallery">
            <Plus className="w-4 h-4 mr-1 rtl:mr-0 rtl:ml-1" />
            {isRTL ? "إضافة" : "Add Image"}
          </Button>
        </div>
        <div className="space-y-3">
          {galleryMedia.length > 0 ? (
            galleryMedia.map((m, i) => renderMediaCard(m, true, i))
          ) : (
            <div className="text-center p-8 bg-slate-50 border rounded-lg text-slate-500">
              {isRTL ? "لا توجد لقطات. سيتم استخدام اللقطات الافتراضية." : "No gallery images. Defaults will be used."}
            </div>
          )}
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md" dir={direction}>
          <DialogHeader>
            <DialogTitle>
              {editingMedia
                ? (isReplacing ? (isRTL ? "استبدال الصورة" : "Replace Image") : (isRTL ? "تعديل النصوص" : "Edit Details"))
                : (isRTL ? "إضافة صورة" : "Add Image")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(!editingMedia || isReplacing) && (
              <div className="space-y-2">
                <Label>{isRTL ? "الصورة" : "Image File"} (PNG, JPEG, WebP &le; 10MB)</Label>
                <Input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  data-testid="input-file"
                />
              </div>
            )}

            {(!editingMedia || !isReplacing) && (
              <>
                <div className="space-y-2">
                  <Label>{isRTL ? "موضع العرض" : "Placement"}</Label>
                  <Select value={mediaType} onValueChange={(val: "HERO" | "GALLERY") => setMediaType(val)}>
                    <SelectTrigger dir={direction} data-testid="select-media-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent dir={direction}>
                      <SelectItem value="HERO">{isRTL ? "صورة الغلاف (Hero)" : "Hero Image"}</SelectItem>
                      <SelectItem value="GALLERY">{isRTL ? "لقطات النظام (Gallery)" : "Gallery"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? "العنوان (عربي)" : "Title (Arabic)"}</Label>
                  <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" data-testid="input-title-ar" />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? "العنوان (إنجليزي)" : "Title (English)"}</Label>
                  <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} dir="ltr" data-testid="input-title-en" />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? "الوصف (عربي) - اختياري" : "Description (Arabic) - Optional"}</Label>
                  <Textarea value={descAr} onChange={(e) => setDescAr(e.target.value)} dir="rtl" data-testid="input-desc-ar" />
                </div>
                <div className="space-y-2">
                  <Label>{isRTL ? "الوصف (إنجليزي) - اختياري" : "Description (English) - Optional"}</Label>
                  <Textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} dir="ltr" data-testid="input-desc-en" />
                </div>
                {!editingMedia && (
                  <div className="flex items-center gap-2 pt-2">
                    <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="input-active" />
                    <Label>{isRTL ? "نشط ومفعل" : "Active"}</Label>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm} data-testid="btn-cancel">{isRTL ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={handleSave} disabled={requestUrl.isPending || createMedia.isPending || updateMedia.isPending || replaceMedia.isPending} className="bg-brand-navy" data-testid="btn-save">
              {(requestUrl.isPending || createMedia.isPending || updateMedia.isPending || replaceMedia.isPending) ? "..." : (isRTL ? "حفظ" : "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
