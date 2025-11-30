import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileWarning, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { authenticatedFetch, authenticatedFetchText } from '@/lib/api-client.js';

function buildErrorLabel(entry) {
  const lineLabel = entry.line_number ? `שורה ${entry.line_number}: ` : '';
  if (entry.name) {
    return `${lineLabel}${entry.name}`;
  }
  if (entry.student_id) {
    return `${lineLabel}${entry.student_id}`;
  }
  return lineLabel || 'שורה לא מזוהה';
}

export default function DataMaintenanceModal({ open, onClose, orgId, onRefresh }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!open) {
      setIsDownloading(false);
      setIsImporting(false);
      setImportError('');
      setSelectedFile(null);
      setSummary(null);
    }
  }, [open]);

  const failureEntries = useMemo(() => {
    return Array.isArray(summary?.failed) ? summary.failed : [];
  }, [summary]);

  const handleDownload = async () => {
    if (!orgId) return;
    setIsDownloading(true);
    try {
      const csvContent = await authenticatedFetchText(`students/maintenance-export?org_id=${orgId}`);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'student-data-maintenance.csv';
      link.click();
      window.URL.revokeObjectURL(url);
      toast.success('הקובץ ירד בהצלחה.');
    } catch (error) {
      console.error('Failed to download maintenance CSV', error);
      toast.error('הורדת הקובץ נכשלה.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = (event) => {
    const file = event?.target?.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleImport = async (event) => {
    event.preventDefault();
    if (!orgId || !selectedFile) {
      setImportError('נא לבחור קובץ CSV לעדכון.');
      return;
    }

    setIsImporting(true);
    setImportError('');

    try {
      const csvText = await selectedFile.text();
      const payload = await authenticatedFetch('students/maintenance-import', {
        method: 'POST',
        body: {
          org_id: orgId,
          csv_text: csvText,
        },
      });

      setSummary(payload);
      toast.success('ייבוא העדכונים הושלם.');
      if (typeof onRefresh === 'function') {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to import maintenance CSV', error);
      setImportError(error?.message || 'ייבוא הקובץ נכשל.');
      toast.error(error?.message || 'ייבוא הקובץ נכשל.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose?.(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>תחזוקת נתונים (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-neutral-700">
          <p className="text-neutral-600">
            הורידו את קובץ התחזוקה כדי למלא שדות חסרים (תעודת זהות, טלפון, מדריך, תוויות ועוד) ואז העלו את הקובץ המעודכן.
            מזהה המערכת (UUID) משמש להשוואת השורות, ולכן אין למחוק או לערוך אותו.
          </p>

          <div className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="font-semibold text-neutral-900">1. הורדת CSV</p>
              <p className="text-neutral-600">כולל כל התלמידים והעמודות הניתנות לעריכה.</p>
              <Button type="button" onClick={handleDownload} disabled={isDownloading} className="gap-2">
                <Download className="h-4 w-4" />
                {isDownloading ? 'מוריד...' : 'הורד קובץ תחזוקה'}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-neutral-900">2. העלאת CSV מעודכן</p>
              <form className="space-y-2" onSubmit={handleImport}>
                <div className="space-y-1">
                  <Label htmlFor="maintenance-upload">בחרו קובץ CSV</Label>
                  <Input
                    id="maintenance-upload"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                  />
                  <p className="text-xs text-neutral-500">
                    העמודות הנתמכות: System UUID, Name, National ID, Contact Phone, Contact Name, Assigned Instructor ID,
                    Default Service, Default Day of Week, Default Session Time, Notes, Tags, Is Active.
                  </p>
                </div>
                {importError ? (
                  <p className="text-sm text-red-600" role="alert">{importError}</p>
                ) : null}
                <Button type="submit" disabled={isImporting || !selectedFile} className="gap-2">
                  <UploadCloud className="h-4 w-4" />
                  {isImporting ? 'מייבא...' : 'ייבוא עדכונים'}
                </Button>
              </form>
            </div>
          </div>

          {summary ? (
            <div className="space-y-3 rounded-lg border border-neutral-200 p-4">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-900">סה"כ שורות:</span>
                  <span>{summary.total_rows ?? 0}</span>
                </div>
                <div className="flex items-center gap-2 text-green-700">
                  <span className="font-semibold">עודכנו:</span>
                  <span>{summary.updated_count ?? 0}</span>
                </div>
                <div className="flex items-center gap-2 text-red-700">
                  <span className="font-semibold">כשלים:</span>
                  <span>{summary.failed_count ?? 0}</span>
                </div>
              </div>

              {failureEntries.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
                    <FileWarning className="h-4 w-4" />
                    שורות שנכשלו
                  </div>
                  <Separator />
                  <ul className="space-y-2 text-sm text-neutral-700" aria-live="polite">
                    {failureEntries.map((entry, index) => (
                      <li key={`${entry.student_id || index}-${entry.code || index}`} className="rounded-md bg-red-50 p-2">
                        <div className="font-semibold text-red-800">{buildErrorLabel(entry)}</div>
                        <div className="text-red-700">{entry.message || 'השורה נכשלה בעדכון.'}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
