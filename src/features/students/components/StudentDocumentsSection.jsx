import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { FileText, Upload, Download, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, Eye } from 'lucide-react';
import { fetchSettingsValue } from '@/features/settings/api/settings.js';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { useOrg } from '@/org/OrgContext.jsx';

const REQUEST_STATE = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

function formatFileDate(dateString) {
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

export default function StudentDocumentsSection({ student, session, orgId, onRefresh }) {
  const { activeOrg } = useOrg();
  const [loadState, setLoadState] = useState(REQUEST_STATE.idle);
  const [deleteState, setDeleteState] = useState(REQUEST_STATE.idle);
  const [definitions, setDefinitions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [uploadingDefId, setUploadingDefId] = useState(null);
  const [uploadingAdhoc, setUploadingAdhoc] = useState(false);
  const [backgroundUploads, setBackgroundUploads] = useState([]); // Active background uploads

  const studentFiles = Array.isArray(student?.files) ? student.files : [];
  const studentTags = Array.isArray(student?.tags) ? student.tags : [];
  
  // Permission check: member role can only preview files (no download/delete)
  const membershipRole = activeOrg?.membership?.role || 'member';
  const canDownloadFiles = membershipRole === 'admin' || membershipRole === 'owner';
  const canDeleteFiles = membershipRole === 'admin' || membershipRole === 'owner';
  
  // Filter definitions to show only those relevant to this student's tags
  const relevantDefinitions = definitions.filter(def => {
    // If definition has no target_tags, it applies to all students
    if (!def.target_tags || def.target_tags.length === 0) return true;
    
    // If student has no tags, only show definitions with no target_tags
    if (studentTags.length === 0) return false;
    
    // Show definition if student has at least one matching tag
    return def.target_tags.some(targetTag => studentTags.includes(targetTag));
  });
  
  // For mandatory check: only check definitions that are both relevant AND have matching files
  const hasMissingMandatory = relevantDefinitions.some(
    (def) => def.is_mandatory && !studentFiles.find((f) => f.definition_id === def.id)
  );

  // File upload restrictions (memoized to avoid recreating on every render)
  const MAX_FILE_SIZE = useMemo(() => 10 * 1024 * 1024, []); // 10MB
  const ALLOWED_TYPES = useMemo(() => [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ], []);

  // Load document definitions
  useEffect(() => {
    if (!session || !orgId) return;

    const loadDefinitions = async () => {
      setLoadState(REQUEST_STATE.loading);
      try {
        const { value } = await fetchSettingsValue({
          session,
          orgId,
          key: 'document_definitions',
        });

        const parsed = Array.isArray(value) ? value : [];
        setDefinitions(parsed);
        setLoadState(REQUEST_STATE.idle);
        
        // Note: Auto-open logic will run via hasMissingMandatory which uses relevantDefinitions
        // No need to duplicate filtering here
      } catch (error) {
        console.error('Error loading document definitions:', error);
        setLoadState(REQUEST_STATE.error);
      }
    };

    loadDefinitions();
  }, [session, orgId, student?.id]);

  // Auto-open section if there are missing mandatory files (runs when definitions or tags change)
  useEffect(() => {
    if (hasMissingMandatory) {
      setIsOpen(true);
    }
  }, [hasMissingMandatory]);

  const checkForDuplicates = useCallback(
    async (file) => {
      if (!session || !orgId) return { has_duplicates: false, duplicates: [] };

      const token = session.access_token;
      if (!token) {
        console.error('Session missing access_token', session);
        toast.error('שגיאת הרשאה. נא להתחבר מחדש');
        return { has_duplicates: false, duplicates: [] };
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('org_id', orgId);

        const response = await fetch('/api/student-files-check', {
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
          console.error('Duplicate check failed', response.status, response.statusText, errorData);
          
          if (response.status === 401) {
            toast.error('שגיאת הרשאה. נא להתחבר מחדש');
          } else if (errorData.message === 'storage_not_configured') {
            toast.error('אחסון לא מוגדר. נא להגדיר אחסון בהגדרות המערכת');
          } else if (response.status >= 500) {
            toast.error(`שגיאת שרת: ${errorData.message || 'שגיאה לא ידועה'}`);
          }
          return { has_duplicates: false, duplicates: [] };
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Duplicate check error:', error);
        return { has_duplicates: false, duplicates: [] };
      }
    },
    [session, orgId]
  );

  const handleFileUpload = useCallback(
    async (file, definitionId = null, customName = null) => {
      if (!session || !orgId || !student?.id) return;

      const token = session.access_token;
      if (!token) {
        console.error('Session missing access_token');
        toast.error('שגיאת הרשאה. נא להתחבר מחדש');
        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`הקובץ גדול מדי. הגודל המקסימלי הוא 10MB`);
        return;
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`סוג קובץ לא נתמך. אנא העלה PDF, תמונה, או מסמך Word/Excel`);
        return;
      }

      // Check for duplicates BEFORE uploading
      const duplicateCheck = await checkForDuplicates(file);
      if (duplicateCheck.has_duplicates) {
        const duplicateList = duplicateCheck.duplicates
          .map(d => `• ${d.file_name} (${d.student_name})`)
          .join('\n');
        
        const confirmMessage = `הקובץ "${file.name}" כבר קיים במערכת:\n\n${duplicateList}\n\nהאם להעלות בכל זאת?`;
        
        if (!confirm(confirmMessage)) {
          toast.info('העלאת הקובץ בוטלה');
          return;
        }
      }

      // Generate upload ID for tracking
      const uploadId = crypto.randomUUID();
      const uploadInfo = {
        id: uploadId,
        fileName: file.name,
        definitionId,
        progress: 0,
        status: 'uploading',
      };

      // Add to background uploads
      setBackgroundUploads(prev => [...prev, uploadInfo]);

      // Show toast with upload starting
      const toastId = toast.loading(`מעלה: ${file.name}...`, {
        description: '0%',
      });

      // Start upload immediately (background)
      if (definitionId) {
        setUploadingDefId(definitionId);
      } else {
        setUploadingAdhoc(true);
      }

      return new Promise((resolve) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('student_id', student.id);
        formData.append('org_id', orgId);
        if (definitionId) {
          formData.append('definition_id', definitionId);
        }
        if (customName) {
          formData.append('custom_name', customName);
        }

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setBackgroundUploads(prev => 
              prev.map(u => u.id === uploadId ? { ...u, progress: percentComplete } : u)
            );
            toast.loading(`מעלה: ${file.name}...`, {
              id: toastId,
              description: `${percentComplete}%`,
            });
          }
        });

        // Handle completion
        xhr.addEventListener('load', async () => {
          setUploadingDefId(null);
          setUploadingAdhoc(false);
          setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));

          if (xhr.status === 200) {
            toast.success(`הקובץ ${file.name} הועלה בהצלחה!`, {
              id: toastId,
            });

            // Refresh student data
            if (onRefresh) {
              await onRefresh();
            }
            resolve(true);
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              let errorMsg = 'העלאת הקובץ נכשלה';
              
              if (errorData.message === 'file_too_large') {
                errorMsg = 'הקובץ גדול מדי (מקסימום 10MB)';
              } else if (errorData.message === 'invalid_file_type') {
                errorMsg = 'סוג קובץ לא נתמך';
              } else if (errorData.details) {
                errorMsg = errorData.details;
              }
              
              toast.error(errorMsg, { id: toastId });
            } catch {
              toast.error(`העלאת הקובץ נכשלה (שגיאה ${xhr.status})`, { id: toastId });
            }
            resolve(false);
          }
        });

        // Handle errors
        xhr.addEventListener('error', () => {
          setUploadingDefId(null);
          setUploadingAdhoc(false);
          setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
          toast.error(`שגיאת רשת בהעלאת ${file.name}`, { id: toastId });
          resolve(false);
        });

        // Handle abort
        xhr.addEventListener('abort', () => {
          setUploadingDefId(null);
          setUploadingAdhoc(false);
          setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
          toast.info(`העלאת ${file.name} בוטלה`, { id: toastId });
          resolve(false);
        });

        // Send request
        xhr.open('POST', '/api/student-files');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-Supabase-Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('x-supabase-authorization', `Bearer ${token}`);
        xhr.setRequestHeader('x-supabase-auth', `Bearer ${token}`);
        xhr.send(formData);
      });
    },
    [session, orgId, student?.id, onRefresh, checkForDuplicates, ALLOWED_TYPES, MAX_FILE_SIZE]
  );

  const handleFileDelete = useCallback(
    async (fileId) => {
      if (!session || !orgId || !student?.id) return;
      if (!confirm('האם למחוק קובץ זה? פעולה זו אינה ניתנת לביטול.')) return;

      const token = session.access_token;
      if (!token) {
        console.error('Session missing access_token');
        toast.error('שגיאת הרשאה. נא להתחבר מחדש');
        return;
      }

      setDeleteState(REQUEST_STATE.loading);

      try {
        const response = await fetch('/api/student-files', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'X-Supabase-Authorization': `Bearer ${token}`,
            'x-supabase-authorization': `Bearer ${token}`,
            'x-supabase-auth': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            org_id: orgId,
            student_id: student.id,
            file_id: fileId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: 'Delete failed' }));
          throw new Error(errorData.message || 'Delete failed');
        }

        toast.success('הקובץ נמחק בהצלחה!');
        setDeleteState(REQUEST_STATE.idle);
        
        // Refresh student data
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('File delete failed', error);
        toast.error(`מחיקת הקובץ נכשלה: ${error?.message || 'שגיאה לא ידועה'}`);
        setDeleteState(REQUEST_STATE.error);
      }
    },
    [session, orgId, student?.id, onRefresh]
  );

  const handleFileDownload = useCallback(
    async (fileId) => {
      if (!session || !orgId || !student?.id) return;

      const token = session.access_token;
      if (!token) {
        toast.error('שגיאת הרשאה. נא להתחבר מחדש');
        return;
      }

      try {
        // Get presigned download URL
        const response = await fetch(
          `/api/student-files-download?org_id=${encodeURIComponent(orgId)}&student_id=${encodeURIComponent(student.id)}&file_id=${encodeURIComponent(fileId)}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Supabase-Authorization': `Bearer ${token}`,
              'x-supabase-authorization': `Bearer ${token}`,
              'x-supabase-auth': `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to get download URL');
        }

        const { url } = await response.json();
        window.open(url, '_blank');
      } catch (error) {
        console.error('File download failed', error);
        toast.error(`הורדת הקובץ נכשלה: ${error?.message || 'שגיאה לא ידועה'}`);
      }
    },
    [session, orgId, student?.id]
  );

  const handleFilePreview = useCallback(
    async (fileId) => {
      if (!session || !orgId || !student?.id) return;

      const token = session.access_token;
      if (!token) {
        toast.error('שגיאת הרשאה. נא להתחבר מחדש');
        return;
      }

      try {
        // Get presigned preview URL (same endpoint, but we'll open differently)
        const response = await fetch(
          `/api/student-files-download?org_id=${encodeURIComponent(orgId)}&student_id=${encodeURIComponent(student.id)}&file_id=${encodeURIComponent(fileId)}&preview=true`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Supabase-Authorization': `Bearer ${token}`,
              'x-supabase-authorization': `Bearer ${token}`,
              'x-supabase-auth': `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to get preview URL');
        }

        const { url, contentType } = await response.json();
        
        // For supported preview types, open in iframe or new tab
        const previewableTypes = [
          'application/pdf',
          'image/jpeg',
          'image/jpg', 
          'image/png',
          'image/gif',
        ];

        if (previewableTypes.some(type => contentType?.includes(type))) {
          // Open in new window for preview (browser will render it)
          const previewWindow = window.open(url, '_blank');
          if (!previewWindow) {
            toast.error('נא לאפשר חלונות קופצים כדי לצפות בקובץ');
          }
        } else {
          // For non-previewable types, show message
          toast.info('תצוגה מקדימה זמינה רק עבור PDF ותמונות');
        }
      } catch (error) {
        console.error('File preview failed', error);
        toast.error(`תצוגה מקדימה נכשלה: ${error?.message || 'שגיאה לא ידועה'}`);
      }
    },
    [session, orgId, student?.id]
  );

  const handleFileInputChange = useCallback(
    (event, definitionId = null) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (definitionId) {
        handleFileUpload(file, definitionId);
      } else {
        handleFileUpload(file, null, file.name);
      }

      // Reset input
      event.target.value = '';
    },
    [handleFileUpload]
  );

  // Get file for definition
  const getFileForDef = (defId) => {
    return studentFiles.find((f) => f.definition_id === defId);
  };

  // Get adhoc files (no definition_id OR orphaned - definition was deleted)
  const adhocFiles = studentFiles.filter((f) => {
    if (!f.definition_id) return true;
    // Include files whose definition no longer exists in ANY definitions list (truly deleted)
    return !definitions.find(def => def.id === f.definition_id);
  });

  // Helper to check if a file is orphaned (definition was truly deleted)
  const isOrphanedFile = (file) => {
    return file.definition_id && !definitions.find(def => def.id === file.definition_id);
  };

  // Get definition name for a file (current name if definition exists, stored name if orphaned)
  const _getDefinitionNameForFile = (file) => {
    if (!file.definition_id) return null;
    const currentDef = definitions.find(def => def.id === file.definition_id);
    return currentDef?.name || file.definition_name || null;
  };
  void _getDefinitionNameForFile; // Mark as intentionally unused

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card dir="rtl" className="border-slate-200">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-amber-600" />
                <CardTitle className="text-lg font-semibold">מסמכים וקבצים</CardTitle>
                {hasMissingMandatory && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    חסרים מסמכים
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6 pt-4">
            {/* Background Upload Indicator */}
            {backgroundUploads.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2" dir="rtl">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מעלה {backgroundUploads.length} קבצים ברקע
                </div>
                {backgroundUploads.map(upload => (
                  <div key={upload.id} className="text-xs text-blue-800">
                    <div className="flex items-center justify-between mb-1">
                      <span>{upload.fileName}</span>
                      <span>{upload.progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-1.5">
                      <div 
                        className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loadState === REQUEST_STATE.loading && (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-slate-400" />
                <p className="text-sm text-slate-600">טוען מסמכים...</p>
              </div>
            )}

            {loadState === REQUEST_STATE.idle && (
              <>
                {/* Upload Guidelines */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-right" dir="rtl">
                  <h4 className="font-semibold text-blue-900 mb-2">הנחיות העלאת קבצים</h4>
                  <ul className="space-y-1 text-blue-800">
                    <li>• גודל מקסימלי: 10MB</li>
                    <li>• סוגי קבצים מותרים: PDF, תמונות (JPG, PNG, GIF), Word, Excel</li>
                    <li>• שמות קבצים בעברית נתמכים</li>
                  </ul>
                </div>

                {/* Required Documents */}
                {relevantDefinitions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900">מסמכים נדרשים</h3>
                    <div className="space-y-2">
                      {relevantDefinitions.map((def) => {
                        const file = getFileForDef(def.id);
                        const isUploading = uploadingDefId === def.id;

                        return (
                          <div
                            key={def.id}
                            className={`p-4 border rounded-lg ${
                              file ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/30'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {file && canDownloadFiles ? (
                                    <button
                                      onClick={() => handleFilePreview(file.id)}
                                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-right"
                                    >
                                      {def.name}
                                    </button>
                                  ) : (
                                    <span className="font-medium">{def.name}</span>
                                  )}
                                  {def.is_mandatory && (
                                    <Badge variant="destructive" className="text-xs">
                                      חובה
                                    </Badge>
                                  )}
                                  {file && (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                  )}
                                </div>
                                {file && (
                                  <div className="text-sm text-slate-600">
                                    הועלה: {formatFileDate(file.uploaded_at)} • <span dir="ltr">{formatFileSize(file.size)}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {file ? (
                                  <>
                                    {canDownloadFiles ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleFileDownload(file.id)}
                                      >
                                        <Download className="h-4 w-4" />
                                        הורד
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleFilePreview(file.id)}
                                      >
                                        <Eye className="h-4 w-4" />
                                        תצוגה מקדימה
                                      </Button>
                                    )}
                                    {canDeleteFiles && (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleFileDelete(file.id)}
                                        disabled={deleteState === REQUEST_STATE.loading}
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <div className="relative">
                                    <input
                                      type="file"
                                      id={`upload-${def.id}`}
                                      className="sr-only"
                                      onChange={(e) => handleFileInputChange(e, def.id)}
                                      disabled={isUploading}
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() => document.getElementById(`upload-${def.id}`)?.click()}
                                      disabled={isUploading}
                                      className="gap-2"
                                    >
                                      {isUploading ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          מעלה...
                                        </>
                                      ) : (
                                        <>
                                          <Upload className="h-4 w-4" />
                                          העלאה
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Adhoc Files */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-slate-900">קבצים נוספים</h3>
                  {adhocFiles.length === 0 ? (
                    <p className="text-sm text-slate-500 py-4 text-center">אין קבצים נוספים</p>
                  ) : (
                    <div className="space-y-2">
                      {adhocFiles.map((file) => {
                        const isOrphaned = isOrphanedFile(file);
                        // For orphaned files, use stored definition_name; otherwise use current file name
                        const displayName = isOrphaned && file.definition_name 
                          ? `${file.definition_name} - ${student?.name || 'תלמיד'}`
                          : file.name;
                        
                        return (
                          <div key={file.id} className={`p-4 border rounded-lg ${isOrphaned ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {canDownloadFiles ? (
                                    <button
                                      onClick={() => handleFilePreview(file.id)}
                                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-right"
                                    >
                                      {displayName}
                                    </button>
                                  ) : (
                                    <span className="font-medium">{displayName}</span>
                                  )}
                                  {isOrphaned && (
                                    <Badge variant="outline" className="text-xs text-amber-700 border-amber-400">
                                      הגדרה ישנה
                                    </Badge>
                                  )}
                                </div>
                                {isOrphaned && file.original_name && (
                                  <div className="text-xs text-amber-700 mb-1">
                                    קובץ מקורי: {file.original_name}
                                  </div>
                                )}
                                <div className="text-sm text-slate-600">
                                  הועלה: {formatFileDate(file.uploaded_at)} • <span dir="ltr">{formatFileSize(file.size)}</span>
                                </div>
                              </div>
                            <div className="flex gap-2">
                              {canDownloadFiles ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFileDownload(file.id)}
                                >
                                  <Download className="h-4 w-4" />
                                  הורד
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFilePreview(file.id)}
                                >
                                  <Eye className="h-4 w-4" />
                                  תצוגה מקדימה
                                </Button>
                              )}
                              {canDeleteFiles && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleFileDelete(file.id)}
                                  disabled={deleteState === REQUEST_STATE.loading}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              )}
                            </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Upload Adhoc File */}
                  <div className="pt-2">
                    <div className="relative">
                      <input
                        type="file"
                        id="upload-adhoc"
                        className="sr-only"
                        onChange={(e) => handleFileInputChange(e)}
                        disabled={uploadingAdhoc}
                      />
                      <Button
                        variant="outline"
                        onClick={() => document.getElementById('upload-adhoc')?.click()}
                        disabled={uploadingAdhoc}
                        className="w-full gap-2"
                      >
                        {uploadingAdhoc ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            מעלה קובץ...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            העלאת קובץ נוסף
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
