import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { FileText, Upload, Download, Trash2, ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authenticatedFetch } from '@/lib/api-client.js';
import { fetchSettingsValue } from '@/features/settings/api/settings.js';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

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

export default function StudentDocumentsSection({ student, session, orgId, onRefresh }) {
  const [loadState, setLoadState] = useState(REQUEST_STATE.idle);
  const [uploadState, setUploadState] = useState(REQUEST_STATE.idle);
  const [deleteState, setDeleteState] = useState(REQUEST_STATE.idle);
  const [definitions, setDefinitions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [uploadingDefId, setUploadingDefId] = useState(null);
  const [uploadingAdhoc, setUploadingAdhoc] = useState(false);
  const [adhocName, setAdhocName] = useState('');

  const studentFiles = Array.isArray(student?.files) ? student.files : [];
  const hasMissingMandatory = definitions.some(
    (def) => def.is_mandatory && !studentFiles.find((f) => f.definition_id === def.id)
  );

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
        
        // Auto-open if missing mandatory files
        const missing = parsed.some(
          (def) => def.is_mandatory && !studentFiles.find((f) => f.definition_id === def.id)
        );
        if (missing) {
          setIsOpen(true);
        }
      } catch (error) {
        console.error('Error loading document definitions:', error);
        setLoadState(REQUEST_STATE.error);
      }
    };

    loadDefinitions();
  }, [session, orgId, student?.id]);

  const handleFileUpload = useCallback(
    async (file, definitionId = null, customName = null) => {
      if (!session || !orgId || !student?.id) return;

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

      setUploadState(REQUEST_STATE.loading);
      if (definitionId) {
        setUploadingDefId(definitionId);
      } else {
        setUploadingAdhoc(true);
      }

      try {
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

        const response = await fetch('/api/student-files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Upload failed');
        }

        toast.success('הקובץ הועלה בהצלחה!');
        setUploadState(REQUEST_STATE.idle);
        setUploadingDefId(null);
        setUploadingAdhoc(false);
        setAdhocName('');
        
        // Refresh student data
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('File upload failed', error);
        toast.error(`העלאת הקובץ נכשלה: ${error.message}`);
        setUploadState(REQUEST_STATE.error);
        setUploadingDefId(null);
        setUploadingAdhoc(false);
      }
    },
    [session, orgId, student?.id, onRefresh]
  );

  const handleFileDelete = useCallback(
    async (fileId) => {
      if (!session || !orgId || !student?.id) return;
      if (!confirm('האם למחוק קובץ זה? פעולה זו אינה ניתנת לביטול.')) return;

      setDeleteState(REQUEST_STATE.loading);

      try {
        await authenticatedFetch('student-files', {
          method: 'DELETE',
          body: {
            org_id: orgId,
            student_id: student.id,
            file_id: fileId,
          },
        });

        toast.success('הקובץ נמחק בהצלחה!');
        setDeleteState(REQUEST_STATE.idle);
        
        // Refresh student data
        if (onRefresh) {
          await onRefresh();
        }
      } catch (error) {
        console.error('File delete failed', error);
        toast.error(`מחיקת הקובץ נכשלה: ${error.message}`);
        setDeleteState(REQUEST_STATE.error);
      }
    },
    [session, orgId, student?.id, onRefresh]
  );

  const handleFileInputChange = useCallback(
    (event, definitionId = null) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (definitionId) {
        handleFileUpload(file, definitionId);
      } else {
        // For adhoc files, optionally prompt for custom name
        const name = adhocName.trim() || file.name;
        handleFileUpload(file, null, name);
      }

      // Reset input
      event.target.value = '';
    },
    [handleFileUpload, adhocName]
  );

  // Get file for definition
  const getFileForDef = (defId) => {
    return studentFiles.find((f) => f.definition_id === defId);
  };

  // Get adhoc files (no definition_id)
  const adhocFiles = studentFiles.filter((f) => !f.definition_id);

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
                {definitions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-slate-900">מסמכים נדרשים</h3>
                    <div className="space-y-2">
                      {definitions.map((def) => {
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
                                  <span className="font-medium">{def.name}</span>
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
                                    <div>הועלה: {formatFileDate(file.uploaded_at)}</div>
                                    <div>{formatFileSize(file.size)}</div>
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                {file ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => window.open(file.url, '_blank')}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleFileDelete(file.id)}
                                      disabled={deleteState === REQUEST_STATE.loading}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
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
                      {adhocFiles.map((file) => (
                        <div key={file.id} className="p-4 border border-slate-200 rounded-lg bg-white">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium mb-1">{file.name}</div>
                              <div className="text-sm text-slate-600">
                                <div>הועלה: {formatFileDate(file.uploaded_at)}</div>
                                <div>{formatFileSize(file.size)}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(file.url, '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleFileDelete(file.id)}
                                disabled={deleteState === REQUEST_STATE.loading}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
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
