import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Upload, Download, Loader2, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';
import { fetchSettingsValue } from '@/features/settings/api/settings.js';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { authenticatedFetch } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

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

export default function MyInstructorDocuments({ session, orgId, userId }) {
  const [instructor, setInstructor] = useState(null);
  const [definitions, setDefinitions] = useState([]);
  const [uploadingDefId, setUploadingDefId] = useState(null);
  const [uploadingAdhoc, setUploadingAdhoc] = useState(false);
  const [backgroundUploads, setBackgroundUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [duplicateDialog, setDuplicateDialog] = useState(null); // { file, definitionId, definitionName, duplicates }

  const instructorFiles = Array.isArray(instructor?.files) ? instructor.files : [];
  const instructorTypes = Array.isArray(instructor?.instructor_types) ? instructor.instructor_types : [];
  
  // Filter definitions to show only those relevant to this instructor's types
  const relevantDefinitions = definitions.filter(def => {
    if (!def.target_instructor_types || def.target_instructor_types.length === 0) return true;
    if (instructorTypes.length === 0) return false;
    return def.target_instructor_types.some(targetType => instructorTypes.includes(targetType));
  });

  // Load instructor data and document definitions
  useEffect(() => {
    if (!session || !orgId || !userId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load instructor record (filtered to current user by backend)
        console.log('[MyInstructorDocuments] Loading instructor data for userId:', userId, 'orgId:', orgId);
        const instructors = await authenticatedFetch(
          `instructors?org_id=${orgId}`,
          {
            session,
            method: 'GET',
          }
        );
        console.log('[MyInstructorDocuments] Instructors loaded:', instructors);

        const myInstructor = Array.isArray(instructors) && instructors.length > 0 ? instructors[0] : null;
        
        if (!myInstructor) {
          toast.error('לא נמצא רשומת מדריך עבור המשתמש');
          setLoading(false);
          return;
        }

        setInstructor(myInstructor);
        console.log('[MyInstructorDocuments] Loaded instructor:', myInstructor);

        // Load document definitions
        console.log('[MyInstructorDocuments] Loading document definitions');
        const { value } = await fetchSettingsValue({
          session,
          orgId,
          key: 'instructor_document_definitions',
        });
        console.log('[MyInstructorDocuments] Document definitions loaded:', value);

        const parsed = Array.isArray(value) ? value : [];
        setDefinitions(parsed);
      } catch (error) {
        console.error('[MyInstructorDocuments] Failed to load data:', error);
        toast.error(`טעינת נתונים נכשלה: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [session, orgId, userId]);

  const refreshInstructor = useCallback(async () => {
    if (!session || !orgId) return;

    try {
      const instructors = await authenticatedFetch(
        `instructors?org_id=${orgId}`,
        {
          session,
          method: 'GET',
        }
      );

      const myInstructor = Array.isArray(instructors) && instructors.length > 0 ? instructors[0] : null;
      
      if (myInstructor) {
        setInstructor(myInstructor);
      }
    } catch (error) {
      console.error('Failed to refresh instructor:', error);
    }
  }, [session, orgId]);

  const performUpload = useCallback((file, definitionId = null, definitionName = null) => {
    console.log('🔵 [UPLOAD] performUpload called', { fileName: file?.name, definitionId, definitionName });

    const uploadId = crypto.randomUUID();
    const displayName = definitionName || file.name;

    console.log('🔵 [UPLOAD] Creating upload tracking', { uploadId, displayName, instructorId: instructor.id, orgId });

    // Add to background uploads tracking
    setBackgroundUploads(prev => [...prev, {
      id: uploadId,
      filename: file.name,
      definitionName: displayName,
      progress: 0,
    }]);

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('org_id', orgId);
    formData.append('instructor_id', instructor.id);
    if (definitionId) {
      formData.append('definition_id', definitionId);
      formData.append('definition_name', definitionName || '');
    }
    
    console.log('🔵 [UPLOAD] FormData created', { 
      hasFile: formData.has('file'),
      orgId: formData.get('org_id'),
      instructorId: formData.get('instructor_id'),
      definitionId: formData.get('definition_id')
    });

    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();
    
    console.log('🔵 [UPLOAD] XHR created, setting up listeners');

    xhr.upload.addEventListener('progress', (e) => {
      console.log('🔵 [UPLOAD] Progress event', { loaded: e.loaded, total: e.total, computable: e.lengthComputable });
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        setBackgroundUploads(prev => 
          prev.map(upload => 
            upload.id === uploadId 
              ? { ...upload, progress: percentComplete }
              : upload
          )
        );
      }
    });

    xhr.addEventListener('load', () => {
      console.log('🔵 [UPLOAD] Load event', { status: xhr.status, statusText: xhr.statusText, responseLength: xhr.responseText?.length });
      setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
      
      if (xhr.status === 200) {
        console.log('✅ [UPLOAD] Upload successful', xhr.responseText);
        toast.success('הקובץ הועלה בהצלחה');
        refreshInstructor();
      } else {
        console.log('❌ [UPLOAD] Upload failed', { status: xhr.status, response: xhr.responseText });
        let errorMsg = 'העלאת הקובץ נכשלה';
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.message) {
            errorMsg = response.message;
          }
        } catch {
          // Use default error message
        }
        toast.error(errorMsg);
      }

      if (definitionId) {
        setUploadingDefId(null);
      } else {
        setUploadingAdhoc(false);
      }
    });

    xhr.addEventListener('error', () => {
      console.log('❌ [UPLOAD] Error event - network error or CORS');
      setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
      toast.error('העלאת הקובץ נכשלה');
      
      if (definitionId) {
        setUploadingDefId(null);
      } else {
        setUploadingAdhoc(false);
      }
    });

    const uploadUrl = `/api/instructor-files?org_id=${orgId}`;
    console.log('🔵 [UPLOAD] Opening XHR', { method: 'POST', url: uploadUrl });
    xhr.open('POST', uploadUrl);
    
    // Add auth headers
    const token = session?.access_token;
    console.log('🔵 [UPLOAD] Adding headers', { hasToken: !!token, tokenLength: token?.length });
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Supabase-Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-supabase-authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-supabase-auth', `Bearer ${token}`);
    }

    console.log('🔵 [UPLOAD] Sending XHR request...');
    xhr.send(formData);
    console.log('🔵 [UPLOAD] XHR.send() called');

    if (definitionId) {
      setUploadingDefId(definitionId);
    } else {
      setUploadingAdhoc(true);
    }
  }, [instructor, orgId, session, refreshInstructor]);

  const handleFileUpload = useCallback(async (file, definitionId = null, definitionName = null) => {
    console.log('🔵 [UPLOAD] handleFileUpload called', { fileName: file?.name, definitionId, definitionName, hasInstructor: !!instructor });
    
    if (!file || !instructor) {
      console.log('❌ [UPLOAD] Missing file or instructor', { hasFile: !!file, hasInstructor: !!instructor });
      return;
    }

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    const ALLOWED_MIME_TYPES = [
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

    console.log('🔵 [UPLOAD] Validating file', { size: file.size, type: file.type, maxSize: MAX_FILE_SIZE_BYTES });

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.log('❌ [UPLOAD] File too large', { size: file.size, max: MAX_FILE_SIZE_BYTES });
      toast.error('הקובץ גדול מדי. גודל מקסימלי: 10MB');
      return;
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      console.log('❌ [UPLOAD] Invalid file type', { type: file.type, allowed: ALLOWED_MIME_TYPES });
      toast.error('סוג קובץ לא נתמך. נא להעלות PDF, תמונה, Word או Excel');
      return;
    }
    
    console.log('✅ [UPLOAD] File validation passed');

    // Check for duplicates before upload
    try {
      console.log('🔍 [UPLOAD] Checking for duplicates...');
      const checkFormData = new FormData();
      checkFormData.append('file', file);
      checkFormData.append('org_id', orgId);
      checkFormData.append('instructor_id', instructor.id);

      const xhr = new XMLHttpRequest();
      
      return new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              console.log('✅ [UPLOAD] Duplicate check response:', response);
              
              if (response.has_duplicates && response.duplicates.length > 0) {
                console.log('⚠️ [UPLOAD] Duplicates found, showing dialog', response.duplicates);
                // Show duplicate confirmation dialog
                setDuplicateDialog({
                  file,
                  definitionId,
                  definitionName,
                  duplicates: response.duplicates,
                });
                resolve();
              } else {
                console.log('✅ [UPLOAD] No duplicates, proceeding with upload');
                // No duplicates, proceed with upload
                performUpload(file, definitionId, definitionName);
                resolve();
              }
            } catch (error) {
              console.error('❌ [UPLOAD] Failed to parse duplicate check response:', error);
              reject(error);
            }
          } else {
            console.error('❌ [UPLOAD] Duplicate check failed:', xhr.status, xhr.responseText);
            // If check fails, still allow upload (fail open)
            toast.warning('בדיקת כפילויות נכשלה, ממשיך בהעלאה...');
            performUpload(file, definitionId, definitionName);
            resolve();
          }
        });

        xhr.addEventListener('error', () => {
          console.error('❌ [UPLOAD] Duplicate check network error');
          // If check fails, still allow upload (fail open)
          toast.warning('בדיקת כפילויות נכשלה, ממשיך בהעלאה...');
          performUpload(file, definitionId, definitionName);
          resolve();
        });

        const checkUrl = `/api/instructor-files-check?org_id=${orgId}`;
        xhr.open('POST', checkUrl);
        
        const token = session?.access_token;
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('X-Supabase-Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('x-supabase-authorization', `Bearer ${token}`);
          xhr.setRequestHeader('x-supabase-auth', `Bearer ${token}`);
        }

        xhr.send(checkFormData);
      });
    } catch (error) {
      console.error('❌ [UPLOAD] Duplicate check error:', error);
      // If check fails, still allow upload (fail open)
      toast.warning('בדיקת כפילויות נכשלה, ממשיך בהעלאה...');
      performUpload(file, definitionId, definitionName);
    }
  }, [instructor, orgId, session, performUpload]);

  const handleDownloadFile = useCallback(async (fileId) => {
    if (!instructor) return;

    const toastId = toast.loading('מכין קובץ להורדה...');

    try {
      const params = new URLSearchParams({
        org_id: orgId,
        instructor_id: instructor.id,
        file_id: fileId,
        preview: 'false',
      });

      const data = await authenticatedFetch(
        `instructor-files-download?${params.toString()}`,
        {
          session,
          method: 'GET',
        }
      );
      
      if (data?.url) {
        // Create temporary anchor element to trigger download
        const a = document.createElement('a');
        a.href = data.url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        toast.success('קובץ הורד בהצלחה', { id: toastId });
      } else {
        throw new Error('No download URL in response');
      }
    } catch (error) {
      console.error('Download error:', error);
      console.error('Error details:', error.message, error.data);
      toast.error(`הורדת הקובץ נכשלה: ${error.message || 'שגיאה לא ידועה'}`, { id: toastId });
    }
  }, [instructor, orgId, session]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!instructor) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">לא נמצא רשומת מדריך</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Categorize files
  const requiredFiles = [];
  const additionalFiles = [];

  relevantDefinitions.forEach(def => {
    const filesForDefinition = instructorFiles.filter(f => f.definition_id === def.id);
    requiredFiles.push({
      definition: def,
      files: filesForDefinition,
    });
  });

  // Additional files (no definition or orphaned)
  instructorFiles.forEach(file => {
    const hasDefinition = relevantDefinitions.some(def => def.id === file.definition_id);
    if (!file.definition_id || !hasDefinition) {
      additionalFiles.push(file);
    }
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Duplicate Confirmation Dialog */}
      <Dialog open={!!duplicateDialog} onOpenChange={(open) => !open && setDuplicateDialog(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-right">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              קובץ כפול זוהה
            </DialogTitle>
            <DialogDescription className="text-right">
              קובץ זהה כבר קיים במערכת. האם ברצונך להמשיך בהעלאה?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3" dir="rtl">
            <div className="text-sm">
              <p className="font-medium">הקובץ הנוכחי:</p>
              <p className="text-muted-foreground">{duplicateDialog?.file?.name}</p>
            </div>

            <div className="text-sm">
              <p className="font-medium mb-2">נמצא גם אצל:</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {duplicateDialog?.duplicates?.map((dup, idx) => (
                  <div key={idx} className="p-2 bg-amber-50 border border-amber-200 rounded text-right">
                    <p className="font-medium">{dup.instructor_name}</p>
                    <div className="text-xs text-muted-foreground mt-1">
                      <p>שם קובץ: {dup.file_name}</p>
                      <p>הועלה ב: {formatFileDate(dup.uploaded_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-right">
              ניתן להעלות את הקובץ בכל זאת אם הוא נדרש גם עבור המדריך הנוכחי.
            </p>
          </div>

          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              variant="outline"
              onClick={() => setDuplicateDialog(null)}
            >
              ביטול
            </Button>
            <Button
              onClick={() => {
                const { file, definitionId, definitionName } = duplicateDialog;
                setDuplicateDialog(null);
                performUpload(file, definitionId, definitionName);
              }}
            >
              העלה בכל זאת
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload progress indicator */}
      {backgroundUploads.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <p className="font-medium text-blue-900">העלאות בתהליך:</p>
                {backgroundUploads.map(upload => (
                  <div key={upload.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-blue-800">{upload.definitionName || upload.filename}</span>
                      <span className="text-blue-600 font-medium">{upload.progress}%</span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${upload.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File upload restrictions info */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900 space-y-1">
              <p className="font-medium">מגבלות העלאת קבצים:</p>
              <ul className="list-disc list-inside space-y-0.5 text-blue-800">
                <li>גודל מקסימלי: 10MB</li>
                <li>סוגי קבצים נתמכים: PDF, תמונות (JPG, PNG, GIF), מסמכי Word, Excel</li>
                <li>תמיכה בשמות קבצים בעברית</li>
                <li className="font-medium">מחיקת מסמכים אפשרית רק על ידי מנהלים - נא לפנות למנהל הארגון</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required Documents */}
      {requiredFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              מסמכים נדרשים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requiredFiles.map(({ definition, files }) => {
              const isMissing = files.length === 0;
              
              return (
                  <div key={definition.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{definition.name}</h3>
                          {definition.is_mandatory && (
                            <Badge variant="destructive" className="text-xs">
                              חובה
                            </Badge>
                          )}
                          {isMissing && definition.is_mandatory && (
                            <Badge variant="outline" className="text-xs border-amber-600 text-amber-700">
                              חסר
                            </Badge>
                          )}
                          {!isMissing && (
                          <Badge variant="outline" className="text-xs border-green-600 text-green-700">
                            <CheckCircle2 className="h-3 w-3 ml-1" />
                            הועלה
                          </Badge>
                        )}
                      </div>
                      {definition.description && (
                        <p className="text-sm text-muted-foreground mt-1">{definition.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Uploaded files for this definition */}
                  {files.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      {files.map(file => (
                        <div key={file.id} className="flex items-center justify-between gap-2 p-2 bg-muted/30 rounded">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span dir="ltr">{formatFileSize(file.size)}</span>
                                <span>•</span>
                                <span>{formatFileDate(file.uploaded_at)}</span>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadFile(file.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload button for this specific document */}
                  <div className="pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx';
                        input.onchange = (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(file, definition.id, definition.name);
                          }
                        };
                        input.click();
                      }}
                      disabled={uploadingDefId === definition.id}
                    >
                      {uploadingDefId === definition.id ? (
                        <>
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                          מעלה...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 ml-2" />
                          {files.length > 0 ? 'העלה קובץ נוסף' : 'העלה קובץ'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Additional Files */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              מסמכים נוספים
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx';
                input.onchange = (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file, null, null);
                  }
                };
                input.click();
              }}
              disabled={uploadingAdhoc}
            >
              {uploadingAdhoc ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  מעלה...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 ml-2" />
                  העלה קובץ
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {additionalFiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              אין מסמכים נוספים
            </p>
          ) : (
            <div className="space-y-2">
              {additionalFiles.map(file => {
                const isOrphaned = file.definition_id && !relevantDefinitions.some(d => d.id === file.definition_id);
                
                return (
                  <div 
                    key={file.id} 
                    className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${
                      isOrphaned ? 'bg-amber-50 border-amber-200' : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{file.name}</p>
                          {isOrphaned && (
                            <Badge variant="outline" className="text-xs border-amber-600 text-amber-700">
                              הגדרה ישנה
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          <span dir="ltr">{formatFileSize(file.size)}</span>
                          <span>•</span>
                          <span>{formatFileDate(file.uploaded_at)}</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadFile(file.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
