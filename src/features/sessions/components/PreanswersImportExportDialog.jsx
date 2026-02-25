import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  Upload,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  exportAnswersAsJSON,
  importAnswersFromJSON,
  downloadJSON,
  generateExportFilename,
  copyToClipboard,
  pasteFromClipboard,
} from '@/features/sessions/utils/preanswers-export-import';
import { toast } from 'sonner';

/**
 * Per-question import/export dialog
 * Exports specific question answers with context
 * Imports into a selected target question
 */
export default function PreanswersImportExportDialog({
  open,
  onClose,
  currentAnswers,
  onImport,
  questions = [],
  capLimit = 50,
}) {
  const [importText, setImportText] = useState('');
  const [importedData, setImportedData] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importedQuestionLabel, setImportedQuestionLabel] = useState(null);
  const [targetQuestionId, setTargetQuestionId] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Filter text/textarea questions for import target
  const textQuestions = questions.filter((q) => q.type === 'text' || q.type === 'textarea');

  const handleExportQuestion = (questionId) => {
    try {
      const question = questions.find((q) => q.id === questionId);
      if (!question) {
        toast.error('שאלה לא נמצאה');
        return;
      }

      const answers = currentAnswers[questionId] || [];
      const json = exportAnswersAsJSON(answers, question);
      const filename = generateExportFilename(question.label);
      downloadJSON(json, filename);
      toast.success(`ניצור קובץ: ${filename}`);
    } catch (error) {
      toast.error(`שגיאה בהורדה: ${error.message}`);
    }
  };

  const handleCopyQuestion = async (questionId) => {
    try {
      const question = questions.find((q) => q.id === questionId);
      if (!question) {
        toast.error('שאלה לא נמצאה');
        return;
      }

      const answers = currentAnswers[questionId] || [];
      const json = exportAnswersAsJSON(answers, question);
      const success = await copyToClipboard(json);
      if (success) {
        setIsCopied(true);
        toast.success('הועתק ללוח העריכה');
        setTimeout(() => setIsCopied(false), 2000);
      } else {
        toast.error('לא הצלחנו להעתיק ללוח העריכה');
      }
    } catch (error) {
      toast.error(`שגיאה: ${error.message}`);
    }
  };

  const handlePasteImport = async () => {
    try {
      setIsLoading(true);
      const text = await pasteFromClipboard();
      if (!text) {
        setImportError('לא נמצא תוכן בלוח העריכה');
        return;
      }
      setImportText(text);
      const result = importAnswersFromJSON(text);
      if (result.success) {
        setImportedData(result.data);
        setImportedQuestionLabel(result.questionLabel);
        setImportError(null);
        toast.success('נתונים נטענו בהצלחה');
      } else {
        setImportedData(null);
        setImportedQuestionLabel(null);
        setImportError(result.error);
        toast.error(`שגיאה בקריאה: ${result.error}`);
      }
    } catch (error) {
      setImportError(`שגיאה: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasteManual = () => {
    try {
      const result = importAnswersFromJSON(importText);
      if (result.success) {
        setImportedData(result.data);
        setImportedQuestionLabel(result.questionLabel);
        setImportError(null);
        toast.success('נתונים נטענו בהצלחה');
      } else {
        setImportedData(null);
        setImportedQuestionLabel(null);
        setImportError(result.error);
        toast.error(`שגיאה בקריאה: ${result.error}`);
      }
    } catch (error) {
      setImportError(`שגיאה: ${error.message}`);
    }
  };

  const handleApplyImport = () => {
    if (!importedData || !targetQuestionId) {
      toast.error('בחר שאלה יעד');
      return;
    }

    const targetQuestion = questions.find((q) => q.id === targetQuestionId);
    if (!targetQuestion) {
      toast.error('שאלה יעד לא נמצאה');
      return;
    }

    // Merge with existing answers, respecting cap limit from org config
    const existing = currentAnswers[targetQuestionId] || [];
    const merged = [...existing];
    const seen = new Set(merged);

    let addedCount = 0;
    for (const answer of importedData) {
      if (typeof answer !== 'string') continue;
      const trimmed = answer.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      if (merged.length >= capLimit) break; // Enforce cap limit from org config
      seen.add(trimmed);
      merged.push(trimmed);
      addedCount += 1;
    }

    // Create map with just this question
    const toSave = { ...currentAnswers };
    toSave[targetQuestionId] = merged;

    onImport?.(toSave);
    const message = addedCount > 0
      ? `${addedCount} תשובות יובאו לשאלה "${targetQuestion.label}"`
      : `כל התשובות כבר קיימות בשאלה "${targetQuestion.label}"`;
    toast.success(message);
    onClose?.();
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result;
        setImportText(text);
        const result = importAnswersFromJSON(text);
        if (result.success) {
          setImportedData(result.data);
          setImportedQuestionLabel(result.questionLabel);
          setImportError(null);
          toast.success('קובץ נטען בהצלחה');
        } else {
          setImportedData(null);
          setImportedQuestionLabel(null);
          setImportError(result.error);
          toast.error(`שגיאה: ${result.error}`);
        }
      } catch (error) {
        setImportError(`שגיאה בקריאת הקובץ: ${error.message}`);
      }
    };
    reader.readAsText(file);
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle>ייצוא/ייבוא תשובות מוכנות מראש</SheetTitle>
          <SheetDescription>
            ייצא תשובות משאלה ספציפית וייבא אותן לשאלה אחרת. כל קובץ מכיל רק תשובות לשאלה אחת.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          <Tabs defaultValue="export" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="export">ייצוא</TabsTrigger>
              <TabsTrigger value="import">ייבוא</TabsTrigger>
            </TabsList>

            {/* Export Tab */}
            <TabsContent value="export" className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-semibold">בחר שאלה לייצא</h3>
              <p className="text-sm text-slate-600">
                בחר שאלה וייצא את התשובות המוכנות שלה. שם הקובץ יכלול את שם השאלה להקל על הזיהוי.
              </p>

              <div className="space-y-2">
                {textQuestions.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    אין שאלות טקסט זמינות
                  </div>
                ) : (
                  textQuestions
                    .filter((q) => currentAnswers[q.id] && currentAnswers[q.id].length > 0)
                    .map((question) => (
                      <div
                        key={question.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{question.label}</p>
                          <p className="text-xs text-slate-500">
                            {currentAnswers[question.id]?.length || 0} תשובות
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyQuestion(question.id)}
                            title="העתק"
                            className="text-xs"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3 ml-1" />
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3 ml-1" />
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleExportQuestion(question.id)}
                            className="text-xs gap-1"
                          >
                            <Download className="h-3 w-3" />
                            הורד
                          </Button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
            </TabsContent>

            {/* Import Tab */}
            <TabsContent value="import" className="space-y-4">
            <div className="space-y-3">
              <h3 className="font-semibold">ייבא תשובות</h3>

              {/* File Upload */}
              <div className="p-3 bg-amber-50 rounded-lg border-2 border-dashed border-amber-300">
                <label className="flex flex-col items-center gap-2 cursor-pointer">
                  <Upload className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium">בחר קובץ JSON</span>
                  <span className="text-xs text-gray-500">או גרור קובץ</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Paste from Clipboard */}
              <Button
                variant="outline"
                onClick={handlePasteImport}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    טוען...
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 ml-2" />
                    הדבק מלוח העריכה
                  </>
                )}
              </Button>

              {/* Manual Paste */}
              <div className="space-y-2">
                <p className="text-sm font-medium">או הדבק ידנית:</p>
                <Textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="הדבק JSON כאן..."
                  className="font-mono text-xs h-40"
                />
                <Button
                  variant="secondary"
                  onClick={handlePasteManual}
                  disabled={!importText.trim()}
                  className="w-full"
                >
                  טען נתונים
                </Button>
              </div>

              {/* Error Display */}
              {importError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">{importError}</div>
                </div>
              )}

              {/* Success and Target Selection */}
              {importedData && (
                <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <div className="text-sm">
                      <p className="font-medium text-green-900">
                        נטענו בהצלחה {importedData.length} תשובות
                      </p>
                      {importedQuestionLabel && (
                        <p className="text-xs text-green-700 mt-1">
                          מהשאלה: <span className="font-medium">{importedQuestionLabel}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-green-900">
                      בחר שאלה יעד לייבוא:
                    </label>
                    <Select value={targetQuestionId} onValueChange={setTargetQuestionId}>
                      <SelectTrigger className="text-sm text-right">
                        <SelectValue placeholder="בחר שאלה..." />
                      </SelectTrigger>
                      <SelectContent dir="rtl">
                        {textQuestions.map((q) => (
                          <SelectItem key={q.id} value={q.id}>
                            {q.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleApplyImport}
                    disabled={!targetQuestionId}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    ייבא לשאלה הנבחרת
                  </Button>
                </div>
              )}
            </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
