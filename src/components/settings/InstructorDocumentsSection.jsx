import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Upload, Download, Trash2, Loader2, AlertCircle, CheckCircle2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { fetchSettingsValue } from '@/features/settings/api/settings.js';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { authenticatedFetch } from '@/lib/api-client';
import { getAuthClient } from '@/lib/supabase-manager.js';

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

export default function InstructorDocumentsSection({ instructor, session, orgId, onRefresh }) {
  const [definitions, setDefinitions] = useState([]);
  const [uploadingDefId, setUploadingDefId] = useState(null);
  const [uploadingAdhoc, setUploadingAdhoc] = useState(false);
  const [deleteState, setDeleteState] = useState(REQUEST_STATE.idle);
  const [backgroundUploads, setBackgroundUploads] = useState([]);
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'name'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'

  const instructorFiles = Array.isArray(instructor?.files) ? instructor.files : [];
  const instructorTypes = Array.isArray(instructor?.instructor_types) ? instructor.instructor_types : [];
  
  // Filter definitions to show only those relevant to this instructor's types
  const relevantDefinitions = definitions.filter(def => {
    // If definition has no target_instructor_types, it applies to all instructors
    if (!def.target_instructor_types || def.target_instructor_types.length === 0) return true;
    
    // If instructor has no types, only show definitions with no target_instructor_types
    if (instructorTypes.length === 0) return false;
    
    // Show definition if instructor has ANY matching type
    return def.target_instructor_types.some(targetType => instructorTypes.includes(targetType));
  });

  // File upload restrictions
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

  // Load document definitions
  useEffect(() => {
    if (!session || !orgId) return;

    const loadDefinitions = async () => {
      try {
        const { value } = await fetchSettingsValue({
          session,
          orgId,
          key: 'instructor_document_definitions',
        });

        const parsed = Array.isArray(value) ? value : [];
        setDefinitions(parsed);
      } catch (error) {
        console.error('Failed to load instructor document definitions:', error);
        toast.error('טעינת הגדרות מסמכים נכשלה');
      }
    };

    loadDefinitions();
  }, [session, orgId]);

  const handleFileUpload = useCallback(async (file, definitionId = null, definitionName = null) => {
    if (!file) return;

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

    // Validate file
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`הקובץ גדול מדי. גודל מקסימלי: ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('סוג קובץ לא נתמך. קבצים מותרים: PDF, תמונות, Word, Excel');
      return;
    }

    const uploadId = crypto.randomUUID();
    
    // Add to background uploads
    setBackgroundUploads(prev => [...prev, {
              id: uploadId,
              filename: file.name,
              definitionName: definitionName || null,
              progress: 0,
            }]);

            // Show loading toast
            const toastId = toast.loading(`מעלה ${file.name}...`, {
              description: '0%',
            });

            try {
              // Get fresh session token right before upload
              let token;
              try {
                const authClient = getAuthClient();
                const { data, error } = await authClient.auth.getSession();
                
                if (error || !data?.session?.access_token) {
                  console.error('Failed to get fresh session:', error);
                  toast.error('ההרשאה פגה. נא לרענן את הדף ולהתחבר מחדש', {
                    id: toastId,
                    duration: 5000,
                    action: {
                      label: 'רענן',
                      onClick: () => window.location.reload(),
                    },
                  });
                  setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
                  return;
                }
                
                token = data.session.access_token;
              } catch (error) {
                console.error('Session refresh error:', error);
                toast.error('שגיאה בקבלת הרשאה. נא לרענן את הדף', {
                  id: toastId,
                  duration: 5000,
                  action: {
                    label: 'רענן',
                    onClick: () => window.location.reload(),
                  },
                });
                setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
                return;
              }

              const formData = new FormData();
              formData.append('file', file);
              formData.append('org_id', orgId);
              formData.append('instructor_id', instructor.id);
              if (definitionId) {
                formData.append('definition_id', definitionId);
                formData.append('definition_name', definitionName);
              }

              // Use XMLHttpRequest for upload progress
              await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                  if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    setBackgroundUploads(prev => prev.map(u => 
                      u.id === uploadId ? { ...u, progress: percentComplete } : u
                    ));
                    toast.loading(`מעלה ${file.name}...`, {
                      id: toastId,
                      description: `${percentComplete}%`,
                    });
                  }
                });        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            let errorMessage = xhr.statusText || 'Upload failed';
            try {
              const errorData = JSON.parse(xhr.responseText);
              if (errorData.message) {
                errorMessage = errorData.message;
              }
              if (errorData.details) {
                errorMessage += `: ${errorData.details}`;
              }
              
              // Check for auth errors
              if (xhr.status === 401 || errorData.message === 'invalid_or_expired_token' || errorData.message === 'missing_bearer') {
                errorMessage = 'ההרשאה פגה במהלך ההעלאה';
              }
            } catch {
              // Use default error message
              if (xhr.status === 401) {
                errorMessage = 'ההרשאה פגה במהלך ההעלאה';
              }
            }
            console.error('Upload error response:', xhr.status, xhr.responseText);
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

        xhr.open('POST', `/api/instructor-files?org_id=${orgId}`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-Supabase-Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('x-supabase-authorization', `Bearer ${token}`);
        xhr.setRequestHeader('x-supabase-auth', `Bearer ${token}`);

        xhr.send(formData);
      });

      toast.success('הקובץ הועלה בהצלחה', { id: toastId });
      
      // Remove from background uploads
      setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('File upload failed:', error);
      const errorMessage = error.message || 'העלאת הקובץ נכשלה';
      toast.error(errorMessage, { id: toastId });
      
      // Remove from background uploads on error
      setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
    }
  }, [instructor, session, orgId, onRefresh]);

  const handleDeleteFile = useCallback(async (fileId) => {
    if (!confirm('האם למחוק את הקובץ? פעולה זו בלתי הפיכה.')) {
      return;
    }

    setDeleteState(REQUEST_STATE.loading);
    const toastId = toast.loading('מוחק קובץ...');

    try {
      await authenticatedFetch('instructor-files', {
        method: 'DELETE',
        session,
        body: {
          org_id: orgId,
          instructor_id: instructor.id,
          file_id: fileId,
        },
      });

      toast.success('הקובץ נמחק בהצלחה', { id: toastId });
      setDeleteState(REQUEST_STATE.idle);

      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error('File delete failed:', error);
      toast.error('מחיקת הקובץ נכשלה', { id: toastId });
      setDeleteState(REQUEST_STATE.idle);
    }
  }, [instructor, session, orgId, onRefresh]);

  const handleDownloadFile = useCallback(async (file) => {
    const toastId = toast.loading('מכין קובץ להורדה...');

    try {
      const params = new URLSearchParams({
        org_id: orgId,
        instructor_id: instructor.id,
        file_id: file.id,
        preview: 'false',
      });

      const response = await authenticatedFetch(
        `instructor-files-download?${params.toString()}`,
        { session, method: 'GET' }
      );

      if (response?.url) {
        // Fetch the file as blob to force download behavior
        const fileResponse = await fetch(response.url);
        const blob = await fileResponse.blob();
        
        // Create object URL and trigger download
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = file.original_name || file.name;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        
        toast.success('קובץ הורד בהצלחה', { id: toastId });
      } else {
        throw new Error('No download URL returned');
      }
    } catch (error) {
      console.error('File download failed:', error);
      toast.error('הורדת הקובץ נכשלה', { id: toastId });
    }
  }, [instructor, session, orgId]);

  // Group files by definition
  const filesByDefinition = {};
  const adhocFiles = useMemo(() => {
    const files = [];
    instructorFiles.forEach(file => {
      if (!file.definition_id) {
        files.push(file);
      }
    });
    return files;
  }, [instructorFiles]);

  useMemo(() => {
    instructorFiles.forEach(file => {
      if (file.definition_id) {
        if (!filesByDefinition[file.definition_id]) {
          filesByDefinition[file.definition_id] = [];
        }
        filesByDefinition[file.definition_id].push(file);
      }
    });
    return filesByDefinition;
  }, [instructorFiles, filesByDefinition]);

  // Sort adhoc files based on current sort settings
  const sortedAdhocFiles = useMemo(() => {
    const sorted = [...adhocFiles];
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'date') {
        // Sort by uploaded_at date
        const dateA = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0;
        const dateB = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0;
        comparison = dateA - dateB;
      } else if (sortBy === 'name') {
        // Sort by file name
        const nameA = a.name || '';
        const nameB = b.name || '';
        comparison = nameA.localeCompare(nameB, 'he');
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [adhocFiles, sortBy, sortOrder]);

  // Toggle sort order
  const toggleSortOrder = useCallback(() => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  // Change sort field
  const changeSortBy = useCallback((newSortBy) => {
    if (newSortBy === sortBy) {
      toggleSortOrder();
    } else {
      setSortBy(newSortBy);
      setSortOrder('desc'); // Default to descending when changing sort field
    }
  }, [sortBy, toggleSortOrder]);

  // Check if definition still exists
  const getDefinitionById = (defId) => {
    return definitions.find(d => d.id === defId);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Upload progress indicator */}
      {backgroundUploads.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-blue-700 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>העלאת קבצים בתהליך...</span>
          </div>
          {backgroundUploads.map(upload => (
            <div key={upload.id} className="text-sm">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-700">
                  {upload.definitionName || upload.filename}
                </span>
                <span className="text-blue-600 font-medium">{upload.progress}%</span>
              </div>
              <div className="w-full bg-blue-100 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* File restrictions info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">הנחיות העלאת קבצים:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>גודל מקסימלי: 10MB</li>
              <li>סוגי קבצים מותרים: PDF, תמונות (JPG, PNG, GIF), Word, Excel</li>
              <li>שמות קבצים בעברית נתמכים</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Required Documents */}
      {relevantDefinitions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-end">
              <span>מסמכים נדרשים</span>
              <FileText className="h-5 w-5" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {relevantDefinitions.map(def => {
              const defFiles = filesByDefinition[def.id] || [];
              const hasFile = defFiles.length > 0;

              return (
                <div key={def.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {hasFile ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-600" />
                      )}
                      <span className="font-medium">{def.name}</span>
                      {def.is_mandatory && (
                        <Badge variant="destructive" className="text-xs">חובה</Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {uploadingDefId === def.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = ALLOWED_TYPES.join(',');
                            input.multiple = true;
                            input.onchange = async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0) {
                                setUploadingDefId(def.id);
                                for (const file of files) {
                                  await handleFileUpload(file, def.id, def.name);
                                }
                                setUploadingDefId(null);
                              }
                            };
                            input.click();
                          }}
                          disabled={uploadingDefId !== null}
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          העלאה
                        </Button>
                      )}
                    </div>
                  </div>

                  {def.description && (
                    <p className="text-sm text-muted-foreground text-right">
                      {def.description}
                    </p>
                  )}

                  {/* Uploaded files for this definition */}
                  {defFiles.length > 0 && (
                    <div className="space-y-2 mt-3 pt-3 border-t">
                      {defFiles.map(file => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2 bg-slate-50 rounded"
                        >
                          <div className="flex-1 min-w-0 text-right">
                            <p className="text-sm font-medium truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground" dir="ltr">
                              {formatFileSize(file.size)} • {formatFileDate(file.uploaded_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 mr-3">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadFile(file)}
                              title="הורדה"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteFile(file.id)}
                              disabled={deleteState === REQUEST_STATE.loading}
                              className="text-destructive hover:text-destructive"
                              title="מחיקה"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <CardTitle>קבצים נוספים</CardTitle>
            </div>
            {adhocFiles.length > 0 && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={sortBy === 'name' ? 'default' : 'outline'}
                  onClick={() => changeSortBy('name')}
                  className="gap-1"
                >
                  {sortBy === 'name' && sortOrder === 'asc' && <ArrowUp className="h-3 w-3" />}
                  {sortBy === 'name' && sortOrder === 'desc' && <ArrowDown className="h-3 w-3" />}
                  {sortBy !== 'name' && <ArrowUpDown className="h-3 w-3" />}
                  שם
                </Button>
                <Button
                  size="sm"
                  variant={sortBy === 'date' ? 'default' : 'outline'}
                  onClick={() => changeSortBy('date')}
                  className="gap-1"
                >
                  {sortBy === 'date' && sortOrder === 'asc' && <ArrowUp className="h-3 w-3" />}
                  {sortBy === 'date' && sortOrder === 'desc' && <ArrowDown className="h-3 w-3" />}
                  {sortBy !== 'date' && <ArrowUpDown className="h-3 w-3" />}
                  תאריך
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = ALLOWED_TYPES.join(',');
                input.multiple = true;
                input.onchange = async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length > 0) {
                    setUploadingAdhoc(true);
                    for (const file of files) {
                      await handleFileUpload(file);
                    }
                    setUploadingAdhoc(false);
                  }
                };
                input.click();
              }}
              disabled={uploadingAdhoc}
              className="gap-2 flex-1"
            >
              {uploadingAdhoc ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              העלאת קבצים חופשיים
            </Button>
          </div>

          {adhocFiles.length > 0 ? (
            <div className="space-y-2">
              {sortedAdhocFiles.map(file => {
                // Check if file references a deleted definition
                const isOrphaned = file.definition_id && !getDefinitionById(file.definition_id);

                return (
                  <div
                    key={file.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isOrphaned ? 'bg-amber-50 border-amber-200' : 'bg-slate-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        {isOrphaned && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 text-xs">
                            הגדרה ישנה
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {formatFileSize(file.size)} • {formatFileDate(file.uploaded_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 mr-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownloadFile(file)}
                        title="הורדה"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteFile(file.id)}
                        disabled={deleteState === REQUEST_STATE.loading}
                        className="text-destructive hover:text-destructive"
                        title="מחיקה"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">
              לא הועלו קבצים נוספים
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
