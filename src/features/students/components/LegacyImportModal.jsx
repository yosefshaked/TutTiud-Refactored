import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { FileSpreadsheet, ShieldAlert, Upload, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';

const STEPS = Object.freeze({
  warning: 'warning',
  choice: 'choice',
  mapping: 'mapping',
  confirm: 'confirm',
});

function parseCsvColumns(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) {
    return [];
  }
  const headerLine = lines[0];
  const parts = headerLine.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  return parts
    .map((part) => part.trim().replace(/^"|"$/g, ''))
    .filter((part) => part);
}

function buildQuestionOptions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions.map((question) => ({
    key: question.key || question.id || question.label,
    label: question.label || question.key || 'שאלה',
  }));
}

export default function LegacyImportModal({
  open,
  onClose,
  studentName,
  questions,
  canReupload,
  hasLegacyImport,
  onSubmit,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.warning);
  const [structureChoice, setStructureChoice] = useState(null); // 'match' | 'custom'
  const [fileName, setFileName] = useState('');
  const [csvColumns, setCsvColumns] = useState([]);
  const [uploadError, setUploadError] = useState('');
  const [sessionDateColumn, setSessionDateColumn] = useState('');
  const [columnMappings, setColumnMappings] = useState({});
  const [customLabels, setCustomLabels] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const questionOptions = useMemo(() => buildQuestionOptions(questions), [questions]);
  const isMatchFlow = structureChoice === 'match';
  const hasColumns = csvColumns.length > 0;
  const hasDateSelection = Boolean(sessionDateColumn);

  const hasMappings = useMemo(() => {
    if (isMatchFlow) {
      return Object.values(columnMappings).some((value) => Boolean(value));
    }
    return Object.values(customLabels).some((value) => typeof value === 'string' && value.trim());
  }, [isMatchFlow, columnMappings, customLabels]);

  const canAdvanceFromMapping = hasColumns && hasDateSelection && hasMappings;

  useEffect(() => {
    if (!open) {
      setStep(STEPS.warning);
      setStructureChoice(null);
      setFileName('');
      setCsvColumns([]);
      setUploadError('');
      setSessionDateColumn('');
      setColumnMappings({});
      setCustomLabels({});
      setIsSubmitting(false);
      setSubmitError('');
      setSelectedFile(null);
    }
  }, [open]);

  useEffect(() => {
    if (!hasColumns) {
      setSessionDateColumn('');
      setColumnMappings({});
      setCustomLabels({});
    }
  }, [hasColumns]);

  const handleNavigateToBackup = () => {
    navigate('/settings#backup');
    if (onClose) {
      onClose();
    }
  };

  const handleFileChange = (event) => {
    const file = event?.target?.files?.[0];
    setUploadError('');
    setCsvColumns([]);
    setSelectedFile(null);
    setFileName('');
    setSessionDateColumn('');
    setColumnMappings({});
    setCustomLabels({});

    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadError('ניתן לייבא רק קבצי CSV.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result || '';
      const columns = parseCsvColumns(String(text));
      if (!columns.length) {
        setUploadError('לא נמצאו כותרות בקובץ. ודאו שקובץ ה-CSV כולל שורת כותרות.');
        return;
      }
      setCsvColumns(columns);
      setSelectedFile(file);
      setFileName(file.name);
    };
    reader.onerror = () => {
      setUploadError('טעינת הקובץ נכשלה. נסו שנית.');
    };
    reader.readAsText(file);
  };

  const handleMappingChange = (column, value) => {
    setColumnMappings((prev) => ({
      ...prev,
      [column]: value,
    }));
  };

  const handleCustomLabelChange = (column, value) => {
    setCustomLabels((prev) => ({
      ...prev,
      [column]: value,
    }));
  };

  const handleNextFromWarning = () => {
    setStep(STEPS.choice);
  };

  const handleSelectStructure = (choice) => {
    setStructureChoice(choice);
    setStep(STEPS.mapping);
  };

  const handleBackToChoice = () => {
    setStep(STEPS.choice);
  };

  const handleProceedToConfirm = () => {
    if (!canAdvanceFromMapping) {
      return;
    }
    setStep(STEPS.confirm);
  };

  const handleSubmit = async () => {
    if (!onSubmit || !selectedFile) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit({
        file: selectedFile,
        structureChoice,
        sessionDateColumn,
        columnMappings,
        customLabels,
      });
    } catch (error) {
      const message = error?.message || 'ייבוא הדוח נכשל. נסו שוב.';
      setSubmitError(message);
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderWarningStep = () => (
    <div className="space-y-4">
      <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
        <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        <AlertTitle>חשוב: בצעו גיבוי לפני ייבוא נתוני עבר</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            ייבוא דוחות היסטוריים ישנה לצמיתות את נתוני הארגון. מומלץ לבצע גיבוי מלא לפני ההעלאה כדי שתוכלו לשחזר במידת הצורך.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" type="button" onClick={handleNavigateToBackup}>
              מעבר להגדרות גיבוי
            </Button>
            <Button type="button" onClick={handleNextFromWarning}>
              המשך ללא גיבוי
            </Button>
          </div>
        </AlertDescription>
      </Alert>
      {hasLegacyImport ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
          <AlertTitle>נמצאו דוחות Legacy קיימים לתלמיד זה</AlertTitle>
          <AlertDescription className="text-sm">
            ייבוא חדש ימחק את הדוחות ההיסטוריים הקיימים ויחליף אותם בנתונים החדשים אם ההרשאה מאפשרת זאת.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );

  const renderStructureChoice = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">האם מבנה ה-CSV תואם את טופס המפגש הנוכחי?</h3>
        <p className="text-sm text-neutral-600">
          בחרו האם לעדכן לפי שאלות הטופס הקיים או להזין שמות מותאמים לשדות מהעבר.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="justify-between"
          onClick={() => handleSelectStructure('match')}
        >
          <div className="flex flex-col items-start text-right">
            <span className="font-semibold">כן, המבנה תואם</span>
            <span className="text-xs text-neutral-600">אמצו את שאלות הטופס הקיים לבחירת שדות</span>
          </div>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="justify-between"
          onClick={() => handleSelectStructure('custom')}
        >
          <div className="flex flex-col items-start text-right">
            <span className="font-semibold">לא, מבנה שונה</span>
            <span className="text-xs text-neutral-600">כתבו שמות שאלות מותאמים לעמודות הקיימות</span>
          </div>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex justify-start">
        <Button type="button" variant="ghost" onClick={() => setStep(STEPS.warning)} className="gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> חזרה לאזהרת הגיבוי
        </Button>
      </div>
    </div>
  );

  const renderCsvUpload = () => (
    <div className="space-y-3 rounded-md border border-dashed border-neutral-300 p-4">
      <div className="space-y-1">
        <Label htmlFor="legacy-csv-upload" className="text-sm font-semibold text-foreground">
          העלאת קובץ CSV
        </Label>
        <p className="text-xs text-neutral-600">בחרו את קובץ ה-CSV עם כותרות העמודות שברצונכם לייבא.</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id="legacy-csv-upload"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          aria-describedby="legacy-csv-helper"
        />
        {fileName ? (
          <span className="text-xs text-neutral-700" aria-live="polite">נבחר: {fileName}</span>
        ) : null}
      </div>
      <p id="legacy-csv-helper" className="text-xs text-neutral-600">
        ודאו שהשורה הראשונה מכילה כותרות. המערכת תציג אותן למיפוי שאלות.
      </p>
      {uploadError ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <AlertTitle className="text-sm font-semibold">שגיאת העלאה</AlertTitle>
          <AlertDescription className="text-sm">{uploadError}</AlertDescription>
        </Alert>
      ) : null}
      {hasColumns ? (
        <div className="space-y-2 rounded-md bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-700">כותרות שאותרו:</p>
          <div className="flex flex-wrap gap-2">
            {csvColumns.map((column) => (
              <span key={column} className="rounded-full bg-white px-3 py-1 text-xs text-neutral-700 shadow-sm">
                {column}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderSessionDatePicker = () => (
    <div className="space-y-2">
      <Label className="text-sm font-semibold text-foreground" htmlFor="session-date-column">
        עמודת תאריך המפגש
      </Label>
      <Select value={sessionDateColumn} onValueChange={setSessionDateColumn}>
        <SelectTrigger id="session-date-column">
          <SelectValue placeholder="בחרו את העמודה שמייצגת את תאריך המפגש" />
        </SelectTrigger>
        <SelectContent>
          {csvColumns.map((column) => (
            <SelectItem key={column} value={column}>
              {column}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderMatchMapping = () => (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground">מיפוי לשאלות קיימות</h4>
        <p className="text-xs text-neutral-600">
          התאימו כל עמודה לשאלה בטופס המפגש. ניתן להשאיר עמודה ללא מיפוי כדי לדלג עליה.
        </p>
      </div>
      <div className="space-y-3">
        {csvColumns.map((column) => (
          <div key={column} className="space-y-1 rounded-md border border-neutral-200 p-3">
            <Label className="text-sm font-semibold text-foreground" htmlFor={`map-${column}`}>
              {column}
            </Label>
            <Select
              value={columnMappings[column] || ''}
              onValueChange={(value) => handleMappingChange(column, value)}
            >
              <SelectTrigger id={`map-${column}`}>
                <SelectValue placeholder="בחרו שאלה או דלגו" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">דלגו על עמודה זו</SelectItem>
                {questionOptions.map((question) => (
                  <SelectItem key={question.key} value={question.key}>
                    {question.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );

  const renderCustomMapping = () => (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground">מיפוי עם שמות מותאמים</h4>
        <p className="text-xs text-neutral-600">כתבו שם שדה מותאם לכל עמודה שתרצו לכלול בייבוא.</p>
      </div>
      <div className="space-y-3">
        {csvColumns.map((column) => (
          <div key={column} className="space-y-1 rounded-md border border-neutral-200 p-3">
            <Label className="text-sm font-semibold text-foreground" htmlFor={`custom-${column}`}>
              {column}
            </Label>
            <Input
              id={`custom-${column}`}
              value={customLabels[column] || ''}
              onChange={(event) => handleCustomLabelChange(column, event.target.value)}
              placeholder="שם שדה מותאם או השאירו ריק כדי לדלג"
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-5">
      {renderCsvUpload()}
      {hasColumns ? (
        <div className="space-y-4">
          {renderSessionDatePicker()}
          <Separator />
          {isMatchFlow ? renderMatchMapping() : renderCustomMapping()}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 justify-between">
        <Button type="button" variant="ghost" onClick={handleBackToChoice} className="gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> חזרה לבחירת מבנה
        </Button>
        <Button type="button" onClick={handleProceedToConfirm} disabled={!canAdvanceFromMapping} className="gap-2">
          המשך לאישור
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">אישור סופי</h3>
        <p className="text-sm text-neutral-700">
          פעולה זו קבועה ואינה ניתנת לביטול עבור תלמיד זה.
          {!canReupload ? ' לא תוכלו להעלות שוב ללא הפעלה של הרשאת העלאה חוזרת.' : ''}
        </p>
      </div>
      <div className="space-y-3 rounded-md bg-neutral-50 p-4">
        <div className="flex items-center gap-2 text-sm text-neutral-800">
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          <span>קובץ: {fileName}</span>
        </div>
        <div className="text-sm text-neutral-800">תאריך מפגש מתוך: {sessionDateColumn}</div>
        <div className="space-y-2 text-sm text-neutral-800">
          <p className="font-semibold">שדות מיובאים</p>
          {isMatchFlow ? (
            <ul className="list-disc space-y-1 pr-5 text-neutral-700">
              {Object.entries(columnMappings)
                .filter(([, value]) => value)
                .map(([column, value]) => {
                  const match = questionOptions.find((option) => option.key === value);
                  return (
                    <li key={column}>{column} → {match?.label || value}</li>
                  );
                })}
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pr-5 text-neutral-700">
              {Object.entries(customLabels)
                .filter(([, value]) => value?.trim())
                .map(([column, value]) => (
                  <li key={column}>{column} → {value.trim()}</li>
                ))}
            </ul>
          )}
        </div>
      </div>
      {hasLegacyImport ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          <AlertTitle className="text-sm font-semibold">אזהרת העלאה חוזרת</AlertTitle>
          <AlertDescription className="text-sm space-y-1">
            <p>פעולה זו תמחק את כל הדוחות ההיסטוריים שנאספו בעבר לתלמיד זה ותשמור רק את הייבוא החדש.</p>
            <p>הפעולה בלתי הפיכה. האם להמשיך?</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {submitError ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <AlertTitle className="text-sm font-semibold">הייבוא נכשל</AlertTitle>
          <AlertDescription className="text-sm">{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2 justify-between">
        <Button type="button" variant="ghost" onClick={() => setStep(STEPS.mapping)} className="gap-2 text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> חזרה למיפוי
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="gap-2">
          {isSubmitting ? (
            <>
              <Upload className="h-4 w-4 animate-spin" aria-hidden="true" />
              מייבא...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              אישור וייבוא
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const title = (() => {
    if (step === STEPS.warning) {
      return 'ייבוא דוחות היסטוריים';
    }
    if (step === STEPS.choice) {
      return 'בחירת מבנה הקובץ';
    }
    if (step === STEPS.mapping) {
      return 'מיפוי עמודות CSV';
    }
    return 'אישור ייבוא';
  })();

  const handleDialogChange = (nextOpen) => {
    if (!nextOpen && onClose) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">{title}</DialogTitle>
          {studentName ? (
            <p className="text-sm text-neutral-600">סטודנט: {studentName}</p>
          ) : null}
        </DialogHeader>
        <div className="space-y-4">
          {step === STEPS.warning ? renderWarningStep() : null}
          {step === STEPS.choice ? renderStructureChoice() : null}
          {step === STEPS.mapping ? renderMappingStep() : null}
          {step === STEPS.confirm ? renderConfirmStep() : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
