import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Upload, Download, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { fetchSettingsValue } from '@/features/settings/api/settings.js';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { authenticatedFetch } from '@/lib/api-client';

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
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 100) / 100} ${sizes[i]}`;
}

export default function MyInstructorDocuments({ session, orgId, userId }) {
  const [instructor, setInstructor] = useState(null);
  const [definitions, setDefinitions] = useState([]);
  const [uploadingDefId, setUploadingDefId] = useState(null);
  const [uploadingAdhoc, setUploadingAdhoc] = useState(false);
  const [backgroundUploads, setBackgroundUploads] = useState([]);
  const [loading, setLoading] = useState(true);

  const instructorFiles = Array.isArray(instructor?.files) ? instructor.files : [];
  const instructorType = instructor?.instructor_type;
  
  // Filter definitions to show only those relevant to this instructor's type
  const relevantDefinitions = definitions.filter(def => {
    if (!def.target_instructor_types || def.target_instructor_types.length === 0) return true;
    if (!instructorType) return false;
    return def.target_instructor_types.includes(instructorType);
  });

  // Load instructor data and document definitions
  useEffect(() => {
    if (!session || !orgId || !userId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load instructor record (filtered to current user by backend)
        const instructorsResponse = await authenticatedFetch(
          `/api/instructors?org_id=${orgId}`,
          {
            session,
            method: 'GET',
          }
        );

        if (!instructorsResponse.ok) {
          throw new Error('Failed to load instructor data');
        }

        const instructors = await instructorsResponse.json();
        const myInstructor = Array.isArray(instructors) && instructors.length > 0 ? instructors[0] : null;
        
        if (!myInstructor) {
          toast.error('לא נמצא רשומת מדריך עבור המשתמש');
          return;
        }

        setInstructor(myInstructor);

        // Load document definitions
        const { value } = await fetchSettingsValue({
          session,
          orgId,
          key: 'instructor_document_definitions',
        });

        const parsed = Array.isArray(value) ? value : [];
        setDefinitions(parsed);
      } catch (error) {
        console.error('Failed to load data:', error);
        toast.error('טעינת נתונים נכשלה');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [session, orgId, userId]);

  const refreshInstructor = useCallback(async () => {
    if (!session || !orgId) return;

    try {
      const response = await authenticatedFetch(
        `/api/instructors?org_id=${orgId}`,
        {
          session,
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to reload instructor data');
      }

      const instructors = await response.json();
      const myInstructor = Array.isArray(instructors) && instructors.length > 0 ? instructors[0] : null;
      
      if (myInstructor) {
        setInstructor(myInstructor);
      }
    } catch (error) {
      console.error('Failed to refresh instructor:', error);
    }
  }, [session, orgId]);

  const handleFileUpload = useCallback(async (file, definitionId = null, definitionName = null) => {
    if (!file || !instructor) return;

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

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('הקובץ גדול מדי. גודל מקסימלי: 10MB');
      return;
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      toast.error('סוג קובץ לא נתמך. נא להעלות PDF, תמונה, Word או Excel');
      return;
    }

    const uploadId = crypto.randomUUID();
    const displayName = definitionName || file.name;

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

    // Use XMLHttpRequest for progress tracking
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
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
      setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
      
      if (xhr.status === 200) {
        toast.success('הקובץ הועלה בהצלחה');
        refreshInstructor();
      } else {
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
      setBackgroundUploads(prev => prev.filter(u => u.id !== uploadId));
      toast.error('העלאת הקובץ נכשלה');
      
      if (definitionId) {
        setUploadingDefId(null);
      } else {
        setUploadingAdhoc(false);
      }
    });

    xhr.open('POST', '/api/instructor-files');
    
    // Add auth headers
    const token = session?.access_token;
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-Supabase-Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-supabase-authorization', `Bearer ${token}`);
      xhr.setRequestHeader('x-supabase-auth', `Bearer ${token}`);
    }

    xhr.send(formData);

    if (definitionId) {
      setUploadingDefId(definitionId);
    } else {
      setUploadingAdhoc(true);
    }
  }, [instructor, orgId, session, refreshInstructor]);

  const handleDownloadFile = useCallback(async (fileId) => {
    if (!instructor) return;

    try {
      const params = new URLSearchParams({
        org_id: orgId,
        instructor_id: instructor.id,
        file_id: fileId,
      });

      const response = await authenticatedFetch(
        `/api/instructor-files-download?${params.toString()}`,
        {
          session,
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate download URL');
      }

      const data = await response.json();
      
      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('הורדת הקובץ נכשלה');
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
                        <h3 className="font-medium">{definition.label}</h3>
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
                    
                    <div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = '.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.xls,.xlsx';
                          input.onchange = (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(file, definition.id, definition.label);
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
                            העלה קובץ
                          </>
                        )}
                      </Button>
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
                                <span>{formatFileSize(file.size)}</span>
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
                          <span>{formatFileSize(file.size)}</span>
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
