import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  FileSpreadsheet,
  ShieldAlert,
  Upload,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  ListChecks,
  FilePenLine,
  Table,
} from 'lucide-react';
import './LegacyImportModal.css';

const STEPS = Object.freeze({
  warning: 'warning',
  choice: 'choice',
  mapping: 'mapping',
  confirm: 'confirm',
});

// Sentinel for "skip this column" in the match-mapping flow. We can't use an empty string
// as a Select item value because Radix Select reserves empty string for clearing selection.
const SKIP_VALUE = '__skip__';

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
  services = [],
  servicesLoading = false,
  servicesError = '',
  onReloadServices,
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
  const [excludedColumns, setExcludedColumns] = useState({});
  const [serviceMode, setServiceMode] = useState('fixed');
  const [selectedService, setSelectedService] = useState('');
  const [customService, setCustomService] = useState('');
  const [serviceColumn, setServiceColumn] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const questionOptions = useMemo(() => buildQuestionOptions(questions), [questions]);
  const serviceOptions = useMemo(() => {
    if (!Array.isArray(services)) {
      return [];
    }
    const unique = new Set();
    const options = [];
    services.forEach((service) => {
      if (typeof service !== 'string') {
        return;
      }
      const trimmed = service.trim();
      if (!trimmed || unique.has(trimmed)) {
        return;
      }
      unique.add(trimmed);
      options.push(trimmed);
    });
    return options;
  }, [services]);
  const isMatchFlow = structureChoice === 'match';
  const hasColumns = csvColumns.length > 0;
  const hasDateSelection = Boolean(sessionDateColumn);

  const effectiveCustomLabels = useMemo(() => {
    const entries = {};
    csvColumns.forEach((column) => {
      if (excludedColumns[column]) {
        return;
      }
      const rawValue = customLabels[column];
      const label = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : column;
      entries[column] = label;
    });
    return entries;
  }, [csvColumns, customLabels, excludedColumns]);

  const effectiveColumnMappings = useMemo(() => {
    const out = {};
    for (const [col, val] of Object.entries(columnMappings)) {
      if (val && val !== SKIP_VALUE) {
        out[col] = val;
      }
    }
    return out;
  }, [columnMappings]);

  const hasMappings = useMemo(() => {
    if (isMatchFlow) {
      return Object.keys(effectiveColumnMappings).length > 0;
    }
    return Object.keys(effectiveCustomLabels).length > 0;
  }, [isMatchFlow, effectiveColumnMappings, effectiveCustomLabels]);

  const serviceSelectionValid = useMemo(() => {
    if (!hasColumns) {
      return false;
    }

    if (serviceMode === 'column') {
      return Boolean(serviceColumn) && csvColumns.includes(serviceColumn);
    }

    const typed = customService.trim();
    if (typed) {
      return true;
    }

    return Boolean(selectedService);
  }, [hasColumns, serviceMode, serviceColumn, csvColumns, selectedService, customService]);

  const effectiveServiceValue = useMemo(() => {
    if (customService.trim()) {
      return customService.trim();
    }
    if (selectedService === '__none__') {
      return '';
    }
    return selectedService;
  }, [customService, selectedService]);

  const canAdvanceFromMapping = hasColumns && hasDateSelection && hasMappings && serviceSelectionValid;

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
      setExcludedColumns({});
      setServiceMode('fixed');
      setSelectedService('');
      setCustomService('');
      setServiceColumn('');
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
      setExcludedColumns({});
      setServiceColumn('');
    }
  }, [hasColumns]);

  useEffect(() => {
    setCustomLabels((prev) => {
      const next = {};
      csvColumns.forEach((column) => {
        if (Object.prototype.hasOwnProperty.call(prev, column)) {
          next[column] = prev[column];
        } else {
          next[column] = column;
        }
      });
      return next;
    });

    setExcludedColumns((prev) => {
      const next = {};
      csvColumns.forEach((column) => {
        if (prev[column]) {
          next[column] = true;
        }
      });
      return next;
    });
  }, [csvColumns]);

  useEffect(() => {
    if (serviceMode === 'column') {
      setSelectedService('');
      setCustomService('');
    } else {
      setServiceColumn('');
    }
  }, [serviceMode]);

  useEffect(() => {
    if (serviceMode === 'fixed' && !selectedService && !customService && serviceOptions.length === 0) {
      setSelectedService('__none__');
    }
  }, [serviceMode, selectedService, customService, serviceOptions.length]);

  useEffect(() => {
    if (sessionDateColumn) {
      setExcludedColumns((prev) => {
        if (Object.prototype.hasOwnProperty.call(prev, sessionDateColumn)) {
          return prev;
        }
        return {
          ...prev,
          [sessionDateColumn]: true,
        };
      });
    }
  }, [sessionDateColumn]);

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
    setExcludedColumns({});
    setServiceMode('fixed');
    setSelectedService('');
    setCustomService('');
    setServiceColumn('');

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

  const toggleColumnInclusion = (column) => {
    setExcludedColumns((prev) => ({
      ...prev,
      [column]: !prev[column],
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
    setSelectedFile(null);
    setFileName('');
    setCsvColumns([]);
    setUploadError('');
    setSessionDateColumn('');
    setColumnMappings({});
    setCustomLabels({});
    setExcludedColumns({});
    setServiceMode('fixed');
    setSelectedService('');
    setCustomService('');
    setServiceColumn('');
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
        columnMappings: isMatchFlow ? effectiveColumnMappings : {},
        customLabels: isMatchFlow ? {} : effectiveCustomLabels,
        serviceMode,
        serviceValue: effectiveServiceValue,
        serviceColumn,
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
        <div className="legacy-import-warning-row">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          <div className="legacy-import-warning-text">
            <AlertTitle className="rtl-embed-text text-right">חשוב: בצעו גיבוי לפני ייבוא נתוני עבר</AlertTitle>
            <AlertDescription className="space-y-2 text-sm rtl-embed-text text-right">
              <p>
                ייבוא דוחות היסטוריים עלול לפגוע בדוחות קיימים. מומלץ לבצע גיבוי מלא לפני ההעלאה כדי שתוכלו לשחזר במידת הצורך.
              </p>
              <p className="text-xs text-red-800 rtl-embed-text text-right">
                אם כבר ביצעתם גיבוי, אפשר להמשיך. לחצו על{' '}
                <button type="button" className="legacy-import-warning-link" onClick={handleNavigateToBackup}>
                  מעבר להגדרות
                </button>{' '}
                לביצוע גיבוי לפני ההעלאה.
              </p>
            </AlertDescription>
          </div>
        </div>
      </Alert>
      <div className="legacy-import-warning-actions">
        <Button type="button" onClick={handleNextFromWarning}>
          המשך
        </Button>
      </div>
      {hasLegacyImport ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800 rtl-embed-text">
          <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
          <AlertTitle className="rtl-embed-text text-right">נמצאו דוחות Legacy קיימים לתלמיד זה</AlertTitle>
          <AlertDescription className="text-sm rtl-embed-text text-right">
            ייבוא חדש ימחק את הדוחות ההיסטוריים הקיימים ויחליף אותם בנתונים החדשים אם ההרשאה מאפשרת זאת.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );

  const renderStructureChoice = () => (
    <div className="space-y-4">
      <div className="space-y-2 rtl-embed-text text-right">
        <h3 className="text-base font-semibold text-foreground">האם מבנה ה-CSV תואם את טופס המפגש הנוכחי?</h3>
        <p className="text-sm text-neutral-600">
          בחרו האם לעדכן לפי שאלות הטופס הקיים או להזין שמות מותאמים לשדות מהעבר.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="legacy-import-row-reverse justify-between text-right rtl-embed-text"
          onClick={() => handleSelectStructure('match')}
        >
          <div className="flex flex-1 flex-col items-start text-right rtl-embed-text">
            <span className="font-semibold">כן, המבנה תואם</span>
            <span className="text-xs text-neutral-600">אמצו את שאלות הטופס הקיים לבחירת שדות</span>
          </div>
          <ListChecks className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="legacy-import-row-reverse justify-between text-right rtl-embed-text"
          onClick={() => handleSelectStructure('custom')}
        >
          <div className="flex flex-1 flex-col items-start text-right rtl-embed-text">
            <span className="font-semibold">לא, מבנה שונה</span>
            <span className="text-xs text-neutral-600">כתבו שמות שאלות מותאמים לעמודות הקיימות</span>
          </div>
          <FilePenLine className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="legacy-import-nav-row">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep(STEPS.warning)}
          className="legacy-import-row-reverse gap-2 text-sm rtl-embed-text"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" /> חזרה לאזהרת הגיבוי
        </Button>
      </div>
    </div>
  );

  const renderCsvUpload = () => (
      <div className="space-y-3 rounded-md border border-dashed border-neutral-300 p-4">
      <div className="space-y-1 rtl-embed-text text-right">
        <Label htmlFor="legacy-csv-upload" className="block text-right text-sm font-semibold text-foreground rtl-embed-text">
          העלאת קובץ CSV
        </Label>
        <p className="text-xs text-neutral-600 text-right">בחרו את קובץ ה-CSV עם כותרות העמודות שברצונכם לייבא.</p>
      </div>
      {selectedFile ? (
        <div className="space-y-2 rounded-md bg-neutral-50 p-3 rtl-embed-text text-right">
          <p className="text-xs font-semibold text-neutral-800">קובץ שנבחר: {fileName}</p>
          <p className="text-xs text-neutral-600">לשינוי הקובץ חזרו לשלב בחירת המבנה.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
            <Input
              id="legacy-csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              aria-describedby="legacy-csv-helper"
              className="rtl-embed-text text-right"
            />
          </div>
          <p id="legacy-csv-helper" className="text-xs text-neutral-600 rtl-embed-text text-right">
            ודאו שהשורה הראשונה מכילה כותרות. המערכת תציג אותן למיפוי שאלות.
          </p>
        </>
      )}
      {uploadError ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <AlertTitle className="text-sm font-semibold rtl-embed-text text-right">שגיאת העלאה</AlertTitle>
          <AlertDescription className="text-sm rtl-embed-text text-right">{uploadError}</AlertDescription>
        </Alert>
      ) : null}
      {hasColumns ? (
        <div className="space-y-2 rounded-md bg-neutral-50 p-3">
          <p className="text-xs font-semibold text-neutral-700 rtl-embed-text text-right">כותרות שאותרו:</p>
          <div className="legacy-import-tags">
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
      <Label className="block text-right text-sm font-semibold text-foreground rtl-embed-text" htmlFor="session-date-column">
        עמודת תאריך המפגש
      </Label>
      <Select
        modal={true}
        value={sessionDateColumn}
        onValueChange={setSessionDateColumn}
      >
        <SelectTrigger id="session-date-column" className="rtl-embed-text text-right">
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
      <p className="text-[11px] text-neutral-600 rtl-embed-text text-right">
        עמודת התאריך תוסתר ברשימת השדות המיובאים כברירת מחדל. ניתן לבחור "הכלל" כדי להציג אותה גם בשדות.
      </p>
    </div>
  );

  const renderServiceSelection = () => (
      <div className="space-y-3 rounded-md bg-neutral-50 p-4">
      <div className="legacy-import-row-reverse flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 rtl-embed-text text-right">
          <h4 className="text-sm font-semibold text-foreground">שיוך שירות למפגשים</h4>
          <p className="text-xs text-neutral-600">
            בחרו אם כל השורות יקבלו אותו שירות או אם יש עמודה בקובץ שמגדירה שירות לכל מפגש.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {servicesLoading ? <Loader2 className="h-4 w-4 animate-spin text-neutral-500" aria-hidden="true" /> : null}
          {onReloadServices ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onReloadServices}
              disabled={servicesLoading}
              title="רענון רשימת השירותים מההגדרות"
            >
              רענון
            </Button>
          ) : null}
        </div>
      </div>
      {servicesError ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <AlertTitle className="text-sm font-semibold rtl-embed-text text-right">שגיאת טעינת שירותים</AlertTitle>
          <AlertDescription className="text-sm rtl-embed-text text-right">{servicesError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={serviceMode === 'fixed' ? 'secondary' : 'outline'}
          className="legacy-import-row-reverse justify-between"
          onClick={() => setServiceMode('fixed')}
        >
          <div className="flex flex-col items-start text-right rtl-embed-text">
            <span className="font-semibold">שירות אחיד לכל השורות</span>
            <span className="text-xs text-neutral-600">בחרו שירות אחד או הקלידו שם שירות מותאם</span>
          </div>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant={serviceMode === 'column' ? 'secondary' : 'outline'}
          className="legacy-import-row-reverse justify-between"
          disabled={!hasColumns}
          onClick={() => setServiceMode('column')}
        >
          <div className="flex flex-col items-start text-right rtl-embed-text">
            <span className="font-semibold">שירות לפי עמודה בקובץ</span>
            <span className="text-xs text-neutral-600">בחרו עמודת שירות מתוך הכותרות שהועלו</span>
          </div>
          <Table className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      {serviceMode === 'fixed' ? (
        <div className="space-y-3 rounded-md border border-neutral-200 bg-white p-3">
          {serviceOptions.length ? (
            <div className="space-y-2">
                <Label className="block text-right text-sm font-semibold text-foreground rtl-embed-text" htmlFor="fixed-service-select">
                בחירת שירות מהרשימה
              </Label>
              <Select
                modal={true}
                value={selectedService}
                onValueChange={setSelectedService}
              >
                <SelectTrigger id="fixed-service-select" className="rtl-embed-text text-right">
                  <SelectValue placeholder="בחרו שירות שיוחל על כל השורות" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">ללא שירות</SelectItem>
                  {serviceOptions.map((service) => (
                    <SelectItem key={service} value={service}>
                      {service}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-neutral-600 rtl-embed-text">השארת שדה ריק תשמור את המפגשים ללא שירות מוגדר.</p>
            </div>
          ) : (
            <p className="text-xs text-neutral-700 rtl-embed-text">לא נמצאו שירותים שמורים בארגון. ניתן להקליד שירות מותאם ידנית.</p>
          )}
          <div className="space-y-1">
            <Label className="block text-right text-sm font-semibold text-foreground rtl-embed-text" htmlFor="custom-service-input">
              או הקלידו שם שירות מותאם
            </Label>
            <Input
              id="custom-service-input"
              value={customService}
              onChange={(event) => setCustomService(event.target.value)}
              placeholder="לדוגמה: שירות ייעוצי / סדנה / פעילות"
              className="rtl-embed-text"
            />
            <p className="text-[11px] text-neutral-600 rtl-embed-text">ערך זה יגבר על הבחירה מהרשימה אם מולא.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-white p-3">
          <Label className="block text-right text-sm font-semibold text-foreground rtl-embed-text" htmlFor="service-column-select">
            עמודת שירות מתוך הקובץ
          </Label>
          <Select
            modal={true}
            value={serviceColumn}
            onValueChange={setServiceColumn}
            disabled={!hasColumns}
          >
            <SelectTrigger id="service-column-select" className="rtl-embed-text text-right">
              <SelectValue placeholder="בחרו את העמודה שמייצגת את השירות" />
            </SelectTrigger>
            <SelectContent>
              {csvColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-neutral-600 rtl-embed-text">ערכים ריקים בעמודה יישמרו ללא שיוך שירות.</p>
        </div>
      )}
    </div>
  );

  const renderMatchMapping = () => (
    <div className="space-y-3">
      <div className="space-y-1 rtl-embed-text text-right">
        <h4 className="text-sm font-semibold text-foreground">מיפוי לשאלות קיימות</h4>
        <p className="text-xs text-neutral-600">
          התאימו כל עמודה לשאלה בטופס המפגש. ניתן להשאיר עמודה ללא מיפוי כדי לדלג עליה.
        </p>
      </div>
      <div className="space-y-3">
        {csvColumns.map((column) => {
          const isDateColumn = sessionDateColumn === column;
          const isExcluded = Boolean(excludedColumns[column]);

          return (
            <div key={column} className="space-y-2 rounded-md border border-neutral-200 p-3">
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
                <div className="flex-1 space-y-1">
                  <Label className="block text-right text-sm font-semibold text-foreground rtl-embed-text" htmlFor={`map-${column}`}>
                    {column}
                  </Label>
                  <Select
                    modal={true}
                    value={columnMappings[column] || ''}
                    onValueChange={(value) => handleMappingChange(column, value)}
                    disabled={isExcluded}
                  >
                    <SelectTrigger id={`map-${column}`} className="rtl-embed-text text-right">
                      <SelectValue placeholder="בחרו שאלה או דלגו" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP_VALUE}>דלגו על עמודה זו</SelectItem>
                      {questionOptions.map((question) => (
                        <SelectItem key={question.key} value={question.key}>
                          {question.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-neutral-600 rtl-embed-text text-right">
                    {isDateColumn
                      ? 'עמודת התאריך מוסתרת כברירת מחדל. בטלו את הסימון כדי להציג אותה גם ברשימת השדות.'
                      : 'בחרו שאלה מהטופס או דלגו על עמודה זו.'}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm rtl-embed-text">
                  <input
                    type="checkbox"
                    checked={isExcluded}
                    onChange={() => toggleColumnInclusion(column)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    aria-label={isExcluded ? 'כלול את העמודה' : 'אל תכללו את העמודה'}
                  />
                  <span className="text-right">אל תכללו</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCustomMapping = () => (
    <div className="space-y-3">
      <div className="space-y-1 rtl-embed-text text-right">
        <h4 className="text-sm font-semibold text-foreground">מיפוי עם שמות מותאמים</h4>
        <p className="text-xs text-neutral-600">כתבו שם שדה מותאם לכל עמודה שתרצו לכלול בייבוא. השארת השדה ריק תשמור את שם העמודה המקורי.</p>
      </div>
      <div className="space-y-3">
        {csvColumns.map((column) => {
          const isDateColumn = sessionDateColumn === column;
          const isExcluded = Boolean(excludedColumns[column]);

          return (
            <div key={column} className="space-y-2 rounded-md border border-neutral-200 p-3">
              <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-between">
                <div className="flex-1 space-y-1">
                  <Label className="block text-right text-sm font-semibold text-foreground rtl-embed-text" htmlFor={`custom-${column}`}>
                    {column}
                  </Label>
                  <Input
                    id={`custom-${column}`}
                    value={customLabels[column] || ''}
                    onChange={(event) => handleCustomLabelChange(column, event.target.value)}
                    placeholder="שם שדה מותאם או השתמשו בשם המקורי"
                    className="rtl-embed-text text-right"
                    disabled={isExcluded}
                  />
                  <p className="text-[11px] text-neutral-600 rtl-embed-text text-right">
                    {isDateColumn
                      ? 'עמודת התאריך מוסתרת כברירת מחדל. בטלו את הסימון כדי להציג אותה גם ברשימת השדות.'
                      : 'השאירו את השדה ריק כדי להשתמש בשם העמודה המקורי.'}
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm rtl-embed-text">
                  <input
                    type="checkbox"
                    checked={isExcluded}
                    onChange={() => toggleColumnInclusion(column)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    aria-label={isExcluded ? 'כלול את העמודה' : 'אל תכללו את העמודה'}
                  />
                  <span className="text-right">אל תכללו</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-5">
      {renderCsvUpload()}
      {hasColumns ? (
        <div className="space-y-4">
          {renderSessionDatePicker()}
          {renderServiceSelection()}
          <Separator />
          {isMatchFlow ? renderMatchMapping() : renderCustomMapping()}
        </div>
      ) : null}
      <div className="legacy-import-nav-row">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBackToChoice}
          className="legacy-import-row-reverse gap-2 text-sm rtl-embed-text"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" /> חזרה לבחירת מבנה
        </Button>
        <Button
          type="button"
          onClick={handleProceedToConfirm}
          disabled={!canAdvanceFromMapping}
          className="legacy-import-row-reverse gap-2 rtl-embed-text"
        >
          המשך לאישור
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <div className="space-y-1 rtl-embed-text text-right">
        <h3 className="text-base font-semibold text-foreground">אישור סופי</h3>
        <p className="text-sm text-neutral-700">
          פעולה זו קבועה ואינה ניתנת לביטול עבור תלמיד זה.
          {!canReupload ? ' לא תוכלו להעלות שוב ללא הפעלה של הרשאת העלאה חוזרת.' : ''}
        </p>
      </div>
      <div className="space-y-3 rounded-md bg-neutral-50 p-4">
        <div className="flex items-center gap-2 text-sm text-neutral-800 rtl-embed-text text-right">
          <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          <span>קובץ: {fileName}</span>
        </div>
        <div className="text-sm text-neutral-800 rtl-embed-text text-right">תאריך מפגש מתוך: {sessionDateColumn}</div>
        <div className="text-sm text-neutral-800 rtl-embed-text text-right">
          {serviceMode === 'column'
            ? `שירות לפי עמודה: ${serviceColumn}`
            : `שירות לכל המפגשים: ${effectiveServiceValue ? effectiveServiceValue : 'ללא שירות מוגדר'}`}
        </div>
        <div className="space-y-2 text-sm text-neutral-800 rtl-embed-text text-right">
          <p className="font-semibold">שדות מיובאים</p>
          {isMatchFlow ? (
            <ul className="list-disc space-y-1 pr-5 text-neutral-700 rtl-embed-text text-right">
              {Object.entries(effectiveColumnMappings)
                .filter(([, value]) => value && value !== SKIP_VALUE)
                .map(([column, value]) => {
                  const match = questionOptions.find((option) => option.key === value);
                  return (
                    <li key={column}>{column} → {match?.label || value}</li>
                  );
                })}
            </ul>
          ) : (
            <ul className="list-disc space-y-1 pr-5 text-neutral-700 rtl-embed-text text-right">
              {Object.entries(effectiveCustomLabels).map(([column, value]) => (
                <li key={column}>{column} → {value}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {hasLegacyImport ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          <AlertTitle className="text-sm font-semibold rtl-embed-text text-right">אזהרת העלאה חוזרת</AlertTitle>
          <AlertDescription className="text-sm space-y-1 rtl-embed-text text-right">
            <p>פעולה זו תמחק את כל הדוחות ההיסטוריים שנאספו בעבר לתלמיד זה ותשמור רק את הייבוא החדש.</p>
            <p>הפעולה בלתי הפיכה. האם להמשיך?</p>
          </AlertDescription>
        </Alert>
      ) : null}
      {submitError ? (
        <Alert variant="destructive" className="border-red-200 bg-red-50 text-red-800">
          <AlertTitle className="text-sm font-semibold rtl-embed-text text-right">הייבוא נכשל</AlertTitle>
          <AlertDescription className="text-sm rtl-embed-text text-right">{submitError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="legacy-import-nav-row">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep(STEPS.mapping)}
          className="legacy-import-row-reverse gap-2 text-sm rtl-embed-text"
        >
          <ArrowRight className="h-4 w-4" aria-hidden="true" /> חזרה למיפוי
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="legacy-import-row-reverse gap-2 rtl-embed-text"
        >
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

  const logDialogOutsideEvent = (label, event) => {
    console.log(`Dialog: ${label} fired`, event?.target);
  };

  const handleDialogPointerDownOutside = (event) => {
    logDialogOutsideEvent('onPointerDownOutside', event);
  };

  const handleDialogFocusOutside = (event) => {
    logDialogOutsideEvent('onFocusOutside', event);
  };

  const handleDialogInteractOutside = (event) => {
    logDialogOutsideEvent('onInteractOutside', event);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-3xl"
        onPointerDownOutside={handleDialogPointerDownOutside}
        onFocusOutside={handleDialogFocusOutside}
        onInteractOutside={handleDialogInteractOutside}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground rtl-embed-text">{title}</DialogTitle>
          {studentName ? (
            <p className="text-sm text-neutral-600 rtl-embed-text">סטודנט: {studentName}</p>
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
