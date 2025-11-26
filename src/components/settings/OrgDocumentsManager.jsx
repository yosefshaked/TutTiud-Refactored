import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2, 
  Loader2, 
  AlertCircle, 
  Pencil,
  X,
  Check,
  Calendar,
  CalendarX,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
} from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { he } from 'date-fns/locale';
import { authenticatedFetch } from '@/lib/api-client';
import { getAuthClient } from '@/lib/supabase-manager.js';
import { fetchSettingsValue, upsertSetting } from '@/features/settings/api/settings.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const REQUEST_STATE = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

const VISIBILITY_RESTRICTION_ERROR = 'members_cannot_view_org_documents';

function formatFileDate(dateString) {
  if (!dateString) return '';
  try {
    const parsed = parseISO(dateString);
    return format(parsed, 'dd/MM/yyyy', { locale: he });
  } catch {
    return dateString;
  }
}

function formatDateTime(dateString) {
  if (!dateString) return '';
  try {
    const parsed = parseISO(dateString);
    return format(parsed, 'dd/MM/yyyy HH:mm', { locale: he });
  } catch {
    return dateString;
  }
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = Math.round((bytes / Math.pow(k, i)) * 100) / 100;
  return `${size} ${sizes[i]}`;
}

/**
 * Check if a document is expired
 */
function isExpired(expirationDate) {
  if (!expirationDate) return false;
  try {
    const expDate = parseISO(expirationDate);
    const today = startOfDay(new Date());
    return isBefore(expDate, today);
  } catch {
    return false;
  }
}

/**
 * Pre-upload dialog for editing file metadata before uploading
 */
function PreUploadDialog({ file, onConfirm, onCancel }) {
  const [name, setName] = useState(file?.name || '');
  const [relevantDate, setRelevantDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  useEffect(() => {
    if (file) {
      // Remove extension from default name
      const nameParts = file.name.split('.');
      if (nameParts.length > 1) {
        nameParts.pop();
      }
      setName(nameParts.join('.'));
    }
  }, [file]);

  const handleConfirm = () => {
    onConfirm({
      file: file,
      name: name.trim() || file.name,
      relevantDate: relevantDate || null,
      expirationDate: expirationDate || null,
    });
  };

  if (!file) return null;

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">הגדרות מסמך</DialogTitle>
          <DialogDescription className="text-right">
            ערוך את פרטי המסמך לפני ההעלאה
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name" className="text-right block">
              שם המסמך <span className="text-red-500">*</span>
            </Label>
            <Input
              id="doc-name"
              dir="rtl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: רישיון עסק"
              className="text-right"
            />
            <p className="text-xs text-muted-foreground text-right">
              קובץ מקורי: {file.name}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relevant-date" className="text-right flex items-center gap-2 justify-end">
              <span>תאריך רלוונטי</span>
              <Calendar className="h-4 w-4" />
            </Label>
            <Input
              id="relevant-date"
              type="date"
              dir="ltr"
              value={relevantDate}
              onChange={(e) => setRelevantDate(e.target.value)}
              className="text-right"
            />
            <p className="text-xs text-muted-foreground text-right">
              תאריך הנפקה, אישור וכדומה
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiration-date" className="text-right flex items-center gap-2 justify-end">
              <span>תאריך תפוגה</span>
              <CalendarX className="h-4 w-4" />
            </Label>
            <Input
              id="expiration-date"
              type="date"
              dir="ltr"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="text-right"
            />
            <p className="text-xs text-muted-foreground text-right">
              המסמך יסומן כפג תוקף לאחר תאריך זה
            </p>
          </div>
        </div>

        <div className="flex gap-2 flex-row-reverse">
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            <Upload className="h-4 w-4 ml-2" />
            העלה
          </Button>
          <Button onClick={onCancel} variant="outline">
            ביטול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edit metadata dialog for existing documents
 */
function EditMetadataDialog({ document, onSave, onCancel }) {
  const [name, setName] = useState(document?.name || '');
  const [relevantDate, setRelevantDate] = useState(document?.relevant_date || '');
  const [expirationDate, setExpirationDate] = useState(document?.expiration_date || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        id: document.id,
        name: name.trim(),
        relevantDate: relevantDate || null,
        expirationDate: expirationDate || null,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!document) return null;

  return (
    <Dialog open={!!document} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">עריכת מסמך</DialogTitle>
          <DialogDescription className="text-right">
            ערוך את פרטי המסמך
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-right block">
              שם המסמך <span className="text-red-500">*</span>
            </Label>
            <Input
              id="edit-name"
              dir="rtl"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-relevant-date" className="text-right flex items-center gap-2 justify-end">
              <span>תאריך רלוונטי</span>
              <Calendar className="h-4 w-4" />
            </Label>
            <Input
              id="edit-relevant-date"
              type="date"
              dir="ltr"
              value={relevantDate}
              onChange={(e) => setRelevantDate(e.target.value)}
              className="text-right"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-expiration-date" className="text-right flex items-center gap-2 justify-end">
              <span>תאריך תפוגה</span>
              <CalendarX className="h-4 w-4" />
            </Label>
            <Input
              id="edit-expiration-date"
              type="date"
              dir="ltr"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="text-right"
            />
          </div>
        </div>

        <div className="flex gap-2 flex-row-reverse">
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 ml-2" />
                שמור
              </>
            )}
          </Button>
          <Button onClick={onCancel} variant="outline" disabled={saving}>
            ביטול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Main component
 */
export default function OrgDocumentsManager({ session, orgId, membershipRole }) {
  const [loadState, setLoadState] = useState(REQUEST_STATE.idle);
  const [uploadState, setUploadState] = useState(REQUEST_STATE.idle);
  const [deleteState, setDeleteState] = useState(REQUEST_STATE.idle);
  const [documents, setDocuments] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);
  const [editingDocument, setEditingDocument] = useState(null);
  const [sortBy, setSortBy] = useState('uploaded_at'); // 'uploaded_at' | 'name' | 'expiration_date'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'
  const [visibilityRestricted, setVisibilityRestricted] = useState(false);
  const [memberVisibility, setMemberVisibility] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);

  const canManage = membershipRole === 'admin' || membershipRole === 'owner';

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];

  // Load documents
  const loadDocuments = useCallback(async () => {
    if (!session || !orgId) return;

    setLoadState(REQUEST_STATE.loading);
    setVisibilityRestricted(false);

    try {
      const response = await authenticatedFetch(`org-documents?org_id=${orgId}`, {
        session,
        method: 'GET',
      });

      setDocuments(response.documents || []);
      setLoadState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load org documents:', error);
      
      // Check if it's a visibility restriction error
      if (error.message === 'members_cannot_view_org_documents') {
        setVisibilityRestricted(true);
        setLoadState(REQUEST_STATE.idle);
      } else {
        toast.error('שגיאה בטעינת מסמכים');
        setLoadState(REQUEST_STATE.error);
      }
    }
  }, [session, orgId]);

  // Load member visibility setting
  const loadVisibilitySetting = useCallback(async () => {
    if (!session || !orgId || !canManage) return;

    try {
      const response = await fetchSettingsValue({ 
        session, 
        orgId, 
        key: 'org_documents_member_visibility' 
      });
      setMemberVisibility(response?.value === true || response?.value === 'true');
    } catch (error) {
      console.error('Failed to load visibility setting:', error);
      setMemberVisibility(false);
    }
  }, [session, orgId, canManage]);

  // Save member visibility setting
  const handleVisibilityToggle = useCallback(async (enabled) => {
    if (!session || !orgId) return;

    setSavingVisibility(true);
    setMemberVisibility(enabled);

    try {
      await upsertSetting({
        session,
        orgId,
        key: 'org_documents_member_visibility',
        value: enabled,
      });
      toast.success(enabled ? 'גישת חברים הופעלה' : 'גישת חברים הוסרה');
    } catch (error) {
      console.error('Failed to save visibility setting:', error);
      toast.error('שמירת ההגדרה נכשלה');
      // Revert on error
      setMemberVisibility(!enabled);
    } finally {
      setSavingVisibility(false);
    }
  }, [session, orgId]);

  useEffect(() => {
    loadDocuments();
    loadVisibilitySetting();
  }, [loadDocuments, loadVisibilitySetting]);

  // Handle file selection
  const handleFileSelect = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      toast.error('הקובץ גדול מדי. גודל מקסימלי: 10MB');
      return;
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('סוג קובץ לא נתמך. קבצים מותרים: PDF, תמונות, Word, Excel');
      return;
    }

    // Show pre-upload dialog
    setPendingFile(file);

    // Reset input
    event.target.value = '';
  }, [MAX_FILE_SIZE, ALLOWED_TYPES]);

  // Handle upload with metadata
  const handleUploadConfirm = useCallback(async (fileData) => {
    if (!session || !orgId) return;

    setPendingFile(null);
    setUploadState(REQUEST_STATE.loading);

    const toastId = toast.loading(`מעלה: ${fileData.name}...`);

    try {
      // Get fresh session token
      const authClient = getAuthClient();
      const { data: sessionData, error: sessionError } = await authClient.auth.getSession();
      
      if (sessionError || !sessionData?.session?.access_token) {
        toast.error('ההרשאה פגה. נא לרענן את הדף', {
          id: toastId,
          action: { label: 'רענן', onClick: () => window.location.reload() },
        });
        setUploadState(REQUEST_STATE.idle);
        return;
      }

      const token = sessionData.session.access_token;

      // Build form data
      const formData = new FormData();
      formData.append('file', fileData.file);
      formData.append('name', fileData.name);
      if (fileData.relevantDate) {
        formData.append('relevant_date', fileData.relevantDate);
      }
      if (fileData.expirationDate) {
        formData.append('expiration_date', fileData.expirationDate);
      }

      // Upload
      const response = await fetch(`/api/org-documents?org_id=${orgId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Supabase-Authorization': `Bearer ${token}`,
          'x-supabase-authorization': `Bearer ${token}`,
          'x-supabase-auth': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.message || 'Upload failed');
      }

      toast.success('המסמך הועלה בהצלחה!', { id: toastId });
      setUploadState(REQUEST_STATE.idle);

      // Reload documents
      await loadDocuments();
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(`העלאה נכשלה: ${error.message}`, { id: toastId });
      setUploadState(REQUEST_STATE.error);
    }
  }, [session, orgId, loadDocuments]);

  // Handle metadata update
  const handleUpdateMetadata = useCallback(async (updateData) => {
    if (!session || !orgId) return;

    try {
      await authenticatedFetch('org-documents', {
        method: 'PUT',
        session,
        body: {
          org_id: orgId,
          file_id: updateData.id,
          name: updateData.name,
          relevant_date: updateData.relevantDate,
          expiration_date: updateData.expirationDate,
        },
      });

      toast.success('המסמך עודכן בהצלחה');
      setEditingDocument(null);

      // Reload documents
      await loadDocuments();
    } catch (error) {
      console.error('Update failed:', error);
      toast.error('עדכון המסמך נכשל');
    }
  }, [session, orgId, loadDocuments]);

  // Handle delete
  const handleDelete = useCallback(async (documentId, documentName) => {
    if (!session || !orgId) return;
    if (!confirm(`האם למחוק את המסמך "${documentName}"? פעולה זו בלתי הפיכה.`)) return;

    setDeleteState(REQUEST_STATE.loading);
    const toastId = toast.loading('מוחק מסמך...');

    try {
      await authenticatedFetch('org-documents', {
        method: 'DELETE',
        session,
        body: {
          org_id: orgId,
          file_id: documentId,
        },
      });

      toast.success('המסמך נמחק בהצלחה', { id: toastId });
      setDeleteState(REQUEST_STATE.idle);

      // Reload documents
      await loadDocuments();
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('מחיקת המסמך נכשלה', { id: toastId });
      setDeleteState(REQUEST_STATE.error);
    }
  }, [session, orgId, loadDocuments]);

  // Handle download
  const handleDownload = useCallback(async (document) => {
    if (!session || !orgId) return;

    const toastId = toast.loading('מכין להורדה...');

    try {
      const response = await authenticatedFetch(
        `org-documents-download?org_id=${orgId}&file_id=${document.id}`,
        { session, method: 'GET' }
      );

      if (response?.url) {
        toast.success('מוריד מסמך...', { id: toastId });
        window.open(response.url, '_blank');
      } else {
        throw new Error('No download URL returned');
      }
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('הורדת המסמך נכשלה', { id: toastId });
    }
  }, [session, orgId]);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    const sorted = [...documents];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'name') {
        comparison = (a.name || '').localeCompare(b.name || '', 'he');
      } else if (sortBy === 'uploaded_at') {
        const dateA = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
        const dateB = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'expiration_date') {
        const dateA = a.expiration_date ? new Date(a.expiration_date).getTime() : Infinity;
        const dateB = b.expiration_date ? new Date(b.expiration_date).getTime() : Infinity;
        comparison = dateA - dateB;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [documents, sortBy, sortOrder]);

  // Toggle sort
  const toggleSort = useCallback((field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }, [sortBy]);

  // Separate expired and active documents
  const expiredDocs = sortedDocuments.filter(doc => isExpired(doc.expiration_date));
  const activeDocs = sortedDocuments.filter(doc => !isExpired(doc.expiration_date));

  return (
    <>
      <Card dir="rtl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <CardTitle>מסמכי הארגון</CardTitle>
              {expiredDocs.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {expiredDocs.length} פג תוקף
                </Badge>
              )}
            </div>
            {canManage && (
              <div className="flex gap-2">
                {documents.length > 0 && (
                  <>
                    <Button
                      size="sm"
                      variant={sortBy === 'name' ? 'default' : 'outline'}
                      onClick={() => toggleSort('name')}
                      className="gap-1"
                    >
                      {sortBy === 'name' && sortOrder === 'asc' && <ArrowUp className="h-3 w-3" />}
                      {sortBy === 'name' && sortOrder === 'desc' && <ArrowDown className="h-3 w-3" />}
                      {sortBy !== 'name' && <ArrowUpDown className="h-3 w-3" />}
                      שם
                    </Button>
                    <Button
                      size="sm"
                      variant={sortBy === 'uploaded_at' ? 'default' : 'outline'}
                      onClick={() => toggleSort('uploaded_at')}
                      className="gap-1"
                    >
                      {sortBy === 'uploaded_at' && sortOrder === 'asc' && <ArrowUp className="h-3 w-3" />}
                      {sortBy === 'uploaded_at' && sortOrder === 'desc' && <ArrowDown className="h-3 w-3" />}
                      {sortBy !== 'uploaded_at' && <ArrowUpDown className="h-3 w-3" />}
                      תאריך העלאה
                    </Button>
                    <Button
                      size="sm"
                      variant={sortBy === 'expiration_date' ? 'default' : 'outline'}
                      onClick={() => toggleSort('expiration_date')}
                      className="gap-1"
                    >
                      {sortBy === 'expiration_date' && sortOrder === 'asc' && <ArrowUp className="h-3 w-3" />}
                      {sortBy === 'expiration_date' && sortOrder === 'desc' && <ArrowDown className="h-3 w-3" />}
                      {sortBy !== 'expiration_date' && <ArrowUpDown className="h-3 w-3" />}
                      תפוגה
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Visibility Restriction Message for Non-Admin Members */}
          {visibilityRestricted && !canManage && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
              <div className="flex flex-col items-center gap-3">
                <Building2 className="h-12 w-12 text-amber-600" />
                <div className="space-y-2">
                  <p className="font-semibold text-amber-900">מסמכי הארגון אינם זמינים לצפייה</p>
                  <p className="text-sm text-amber-800">
                    מנהל הארגון הגביל את הגישה למסמכים אלה. נא לפנות למנהל לקבלת מידע נוסף.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Content shown when not restricted */}
          {!visibilityRestricted && (
            <>
              {/* Upload Guidelines */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-700" />
                  <div className="space-y-1">
                    <p className="font-medium text-blue-900">הנחיות העלאה:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-800">
                      <li>גודל מקסימלי: 10MB</li>
                      <li>סוגי קבצים: PDF, תמונות, Word, Excel</li>
                      <li>ניתן לערוך שם, תאריכים ופרטים לפני ואחרי ההעלאה</li>
                    </ul>
                  </div>
                </div>
              </div>

          {/* Member Visibility Toggle (Admin Only) */}
          {canManage && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">אפשר צפייה לחברים</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    כאשר מופעל, חברי צוות יוכלו לצפות ולהוריד מסמכים (ללא אפשרות העלאה/מחיקה)
                  </p>
                </div>
                <Switch
                  checked={memberVisibility}
                  onCheckedChange={handleVisibilityToggle}
                  disabled={savingVisibility}
                  aria-label="החלפת אפשרות צפייה לחברים"
                />
              </div>
            </div>
          )}

          {/* Upload Button */}
          {canManage && (
            <div>
              <input
                type="file"
                id="org-doc-upload"
                className="sr-only"
                onChange={handleFileSelect}
                accept={ALLOWED_TYPES.join(',')}
                disabled={uploadState === REQUEST_STATE.loading}
              />
              <Button
                onClick={() => document.getElementById('org-doc-upload')?.click()}
                disabled={uploadState === REQUEST_STATE.loading}
                className="w-full gap-2"
              >
                {uploadState === REQUEST_STATE.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    מעלה...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    העלאת מסמך חדש
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Documents List */}
          {loadState === REQUEST_STATE.loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-slate-400" />
              <p className="text-sm text-slate-600">טוען מסמכים...</p>
            </div>
          ) : documents.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              טרם הועלו מסמכים ארגוניים
            </p>
          ) : (
            <div className="space-y-4">
              {/* Expired Documents */}
              {expiredDocs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-red-700 flex items-center gap-2 justify-end">
                    <span>מסמכים שפג תוקפם ({expiredDocs.length})</span>
                    <CalendarX className="h-4 w-4" />
                  </h4>
                  {expiredDocs.map(doc => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      expired={true}
                      canManage={canManage}
                      deleteState={deleteState}
                      onEdit={() => setEditingDocument(doc)}
                      onDelete={() => handleDelete(doc.id, doc.name)}
                      onDownload={() => handleDownload(doc)}
                    />
                  ))}
                </div>
              )}

              {/* Active Documents */}
              {activeDocs.length > 0 && (
                <div className="space-y-2">
                  {expiredDocs.length > 0 && (
                    <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 justify-end">
                      <span>מסמכים פעילים ({activeDocs.length})</span>
                      <FileText className="h-4 w-4" />
                    </h4>
                  )}
                  {activeDocs.map(doc => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      expired={false}
                      canManage={canManage}
                      deleteState={deleteState}
                      onEdit={() => setEditingDocument(doc)}
                      onDelete={() => handleDelete(doc.id, doc.name)}
                      onDownload={() => handleDownload(doc)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>

      {/* Pre-upload Dialog */}
      {pendingFile && (
        <PreUploadDialog
          file={pendingFile}
          onConfirm={handleUploadConfirm}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {/* Edit Metadata Dialog */}
      {editingDocument && (
        <EditMetadataDialog
          document={editingDocument}
          onSave={handleUpdateMetadata}
          onCancel={() => setEditingDocument(null)}
        />
      )}
    </>
  );
}

/**
 * Document card component
 */
function DocumentCard({ document, expired, canManage, deleteState, onEdit, onDelete, onDownload }) {
  return (
    <div
      className={`p-4 border rounded-lg ${
        expired ? 'border-red-300 bg-red-50/50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h5 className="font-medium text-slate-900">{document.name}</h5>
            {expired && (
              <Badge variant="destructive" className="text-xs">
                פג תוקף
              </Badge>
            )}
          </div>

          <div className="text-sm text-slate-600 space-y-1">
            {document.original_name && document.original_name !== document.name && (
              <p className="text-xs text-slate-500">קובץ מקורי: {document.original_name}</p>
            )}
            
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span dir="ltr">{formatFileSize(document.size)}</span>
              <span>הועלה: {formatDateTime(document.uploaded_at)}</span>
            </div>

            {document.relevant_date && (
              <div className="flex items-center gap-1 text-xs">
                <Calendar className="h-3 w-3" />
                <span>תאריך רלוונטי: {formatFileDate(document.relevant_date)}</span>
              </div>
            )}

            {document.expiration_date && (
              <div className={`flex items-center gap-1 text-xs ${expired ? 'text-red-700 font-medium' : ''}`}>
                <CalendarX className="h-3 w-3" />
                <span>תפוגה: {formatFileDate(document.expiration_date)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onDownload}
            title="הורדה"
          >
            <Download className="h-4 w-4" />
          </Button>
          {canManage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={onEdit}
                title="עריכה"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={deleteState === REQUEST_STATE.loading}
                className="text-destructive hover:text-destructive"
                title="מחיקה"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
