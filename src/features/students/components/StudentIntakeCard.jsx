import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const EXCLUDED_KEYS = new Set(['intake_html_source', 'intake_date', 'response_id']);

function normalizeString(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return String(value).trim();
}

function normalizeImportantFields(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

function buildIntakeEntries(payload, importantFields) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  const importantSet = new Set(importantFields);
  return Object.entries(payload)
    .filter(([key]) => !EXCLUDED_KEYS.has(key))
    .filter(([key]) => (importantSet.size ? importantSet.has(key) : true))
    .map(([key, value]) => {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value === 'object' && !Array.isArray(value)) {
        return null;
      }
      const textValue = Array.isArray(value)
        ? value.filter((entry) => entry !== null && entry !== undefined).join(', ')
        : String(value);
      const trimmedValue = normalizeString(textValue);
      if (!trimmedValue) {
        return null;
      }
      return { label: key, value: trimmedValue };
    })
    .filter(Boolean);
}

export default function StudentIntakeCard({ intakeResponses, importantFields }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const currentPayload = intakeResponses?.current && typeof intakeResponses.current === 'object'
    ? intakeResponses.current
    : null;

  const htmlSource = normalizeString(currentPayload?.intake_html_source);
  const normalizedImportantFields = useMemo(
    () => normalizeImportantFields(importantFields),
    [importantFields],
  );
  const entries = useMemo(
    () => buildIntakeEntries(currentPayload, normalizedImportantFields),
    [currentPayload, normalizedImportantFields],
  );

  if (!currentPayload) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-foreground sm:text-lg">נתוני קליטה</CardTitle>
        <Button type="button" onClick={() => setIsDialogOpen(true)} disabled={!htmlSource}>
          צפה בטופס המקורי
        </Button>
      </CardHeader>
      <CardContent>
        {entries.length ? (
          <ul className="space-y-2 text-sm text-slate-700" dir="rtl">
            {entries.map((entry) => (
              <li key={entry.label} className="flex flex-wrap gap-2">
                <span className="font-medium">{entry.label}:</span>
                <span>{entry.value}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500" dir="rtl">לא נמצאו נתוני קליטה להצגה.</p>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-right">טופס קליטה מקורי</DialogTitle>
          </DialogHeader>
          {htmlSource ? (
            <div
              className="rounded-md border border-slate-200 bg-white p-4"
              dangerouslySetInnerHTML={{ __html: htmlSource }}
            />
          ) : (
            <p className="text-sm text-slate-500" dir="rtl">לא נמצא טופס HTML לתצוגה.</p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
