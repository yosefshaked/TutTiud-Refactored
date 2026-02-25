import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, CheckCircle2, Plus, Trash2, Download } from 'lucide-react';
import { cn } from '@/lib/utils.js';
import {
  exportAnswersAsJSON,
  downloadJSON,
  generateExportFilename,
} from '@/features/sessions/utils/preanswers-export-import';
import { toast } from 'sonner';

const TAB_ORG = 'org';
const TAB_PERSONAL = 'personal';
const STORAGE_KEY = 'preanswers_last_source';

/**
 * PreanswersPickerDialog - Dialog for searching and selecting preconfigured answers
 */
export default function PreanswersPickerDialog({
  open,
  onClose,
  answers = [],
  personalAnswers = [],
  onSelect,
  onSavePersonal,
  canEditPersonal = false,
  questionLabel = 'שאלה',
  preanswersCapLimit,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_ORG);
  const [draftPersonal, setDraftPersonal] = useState([]);
  const [newEntry, setNewEntry] = useState('');
  const [saving, setSaving] = useState(false);

  // Load last used source from localStorage
  const getLastUsedSource = () => {
    if (typeof window === 'undefined') return TAB_ORG;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === TAB_PERSONAL ? TAB_PERSONAL : TAB_ORG;
    } catch {
      return TAB_ORG;
    }
  };

  // Save source to localStorage
  const saveSourcePreference = (source) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, source);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedAnswer(null);
      setSearchQuery('');
      setNewEntry('');
      setDraftPersonal(Array.isArray(personalAnswers) ? personalAnswers : []);
      const shouldShowPersonal = (personalAnswers && personalAnswers.length > 0) || canEditPersonal;
      
      // Try to restore last used source, but validate it's available
      if (shouldShowPersonal) {
        const lastSource = getLastUsedSource();
        setActiveTab(lastSource);
      } else {
        setActiveTab(TAB_ORG);
      }
    }
  }, [open, personalAnswers, canEditPersonal]);

  const filteredAnswers = useMemo(() => {
    const source = activeTab === TAB_PERSONAL ? draftPersonal : answers;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return source;
    return source.filter((ans) => String(ans).toLowerCase().includes(q));
  }, [activeTab, answers, draftPersonal, searchQuery]);

  const handleInsert = () => {
    if (selectedAnswer) {
      saveSourcePreference(activeTab);
      onSelect?.(selectedAnswer);
      onClose?.();
    }
  };

  const handleAddPersonal = async () => {
    const trimmed = newEntry.trim();
    if (!trimmed) return;
    
    // If no cap defined, still allow adding (but log warning)
    if (!preanswersCapLimit) {
      console.warn('preanswersCapLimit not defined - adding without limit enforcement');
    }
    
    const nextList = draftPersonal.includes(trimmed) 
      ? draftPersonal 
      : preanswersCapLimit 
        ? [...draftPersonal, trimmed].slice(0, preanswersCapLimit)
        : [...draftPersonal, trimmed];
    if (nextList === draftPersonal) return;
    
    setDraftPersonal(nextList);
    setNewEntry('');
    
    if (canEditPersonal && onSavePersonal) {
      try {
        setSaving(true);
        await onSavePersonal(nextList);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleRemovePersonal = async (value) => {
    const nextList = draftPersonal.filter((item) => item !== value);
    setDraftPersonal(nextList);
    if (selectedAnswer === value) {
      setSelectedAnswer(null);
    }
    
    if (canEditPersonal && onSavePersonal) {
      try {
        setSaving(true);
        await onSavePersonal(nextList);
      } finally {
        setSaving(false);
      }
    }
  };

  const showPersonalTab = (personalAnswers && personalAnswers.length > 0) || canEditPersonal;

  const handleExportLegacy = () => {
    try {
      const json = exportAnswersAsJSON(answers, { label: questionLabel });
      const filename = generateExportFilename(questionLabel);
      downloadJSON(json, filename);
      toast.success(`ניצור קובץ: ${filename}`);
    } catch (error) {
      toast.error(`שגיאה בהורדה: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">בחירת תשובה מוכנה</DialogTitle>
          <p className="text-sm text-neutral-600 text-right mt-2">
            {questionLabel}
          </p>
        </DialogHeader>

        <div className="space-y-4" dir="rtl">
          {showPersonalTab ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={activeTab === TAB_ORG ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setActiveTab(TAB_ORG);
                    saveSourcePreference(TAB_ORG);
                  }}
                >
                  תשובות ארגוניות
                </Button>
                <Button
                  type="button"
                  variant={activeTab === TAB_PERSONAL ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setActiveTab(TAB_PERSONAL);
                    saveSourcePreference(TAB_PERSONAL);
                  }}
                >
                  תשובות אישיות
                </Button>
              </div>
              <div className="text-center">
                <span className="text-sm font-medium text-neutral-600">
                  {activeTab === TAB_PERSONAL ? draftPersonal.length : answers.length}
                  {preanswersCapLimit ? (
                    <>
                      <span className="mx-1 text-neutral-400">/</span>
                      <span className={cn(
                        activeTab === TAB_PERSONAL && draftPersonal.length >= preanswersCapLimit 
                          ? 'text-amber-600 font-semibold' 
                          : 'text-neutral-500'
                      )}>
                        {preanswersCapLimit}
                      </span>
                    </>
                  ) : (
                    <span className="mr-2 text-xs text-red-600">(מגבלה לא נטענה)</span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center pb-2">
              <span className="text-sm font-medium text-neutral-600">
                {answers.length}
                {preanswersCapLimit ? (
                  <>
                    <span className="mx-1 text-neutral-400">/</span>
                    <span className="text-neutral-500">{preanswersCapLimit}</span>
                  </>
                ) : (
                  <span className="mr-2 text-xs text-red-600">(מגבלה לא נטענה)</span>
                )}
              </span>
            </div>
          )}

          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="חיפוש תשובות..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
              autoFocus
            />
          </div>

          {activeTab === TAB_PERSONAL && canEditPersonal ? (
            <div className="flex gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <Input
                type="text"
                placeholder="הוסיפו תשובה אישית"
                value={newEntry}
                onChange={(e) => setNewEntry(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddPersonal();
                  }
                }}
                disabled={saving}
              />
              <Button type="button" onClick={handleAddPersonal} className="whitespace-nowrap" disabled={!newEntry.trim() || saving}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">{saving ? 'שומר...' : 'הוספה'}</span>
              </Button>
            </div>
          ) : null}

          <div className="border rounded-lg max-h-[320px] overflow-y-auto">
            {filteredAnswers.length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                {(activeTab === TAB_ORG ? answers.length === 0 : draftPersonal.length === 0)
                  ? 'אין תשובות מוכנות זמינות.'
                  : 'לא נמצאו תשובות התואמות את החיפוש.'}
              </div>
            ) : (
              <ul className="divide-y" role="listbox">
                {filteredAnswers.map((answer, index) => (
                  <li
                    key={`${activeTab}-${index}-${answer}`}
                    role="option"
                    aria-selected={selectedAnswer === answer}
                    className={cn(
                      'p-3 cursor-pointer transition-colors hover:bg-primary/5 flex items-start gap-2 text-right',
                      selectedAnswer === answer ? 'bg-primary/10 border-r-4 border-primary' : ''
                    )}
                    onClick={() => setSelectedAnswer(answer)}
                    onDoubleClick={() => {
                      saveSourcePreference(activeTab);
                      onSelect?.(answer);
                      onClose?.();
                    }}
                  >
                    <span className="text-xs text-neutral-500 leading-6 w-6 text-left">{index + 1}.</span>
                    {selectedAnswer === answer && (
                      <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    )}
                    <span className="text-sm flex-1">{answer}</span>
                    {activeTab === TAB_PERSONAL && canEditPersonal ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePersonal(answer);
                        }}
                        disabled={saving}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse sm:justify-between">
            <div className="flex gap-2 flex-col-reverse sm:flex-row-reverse sm:flex-1">
              <Button
                onClick={handleInsert}
                disabled={!selectedAnswer}
                className="gap-2"
              >
                הכנס תשובה
              </Button>
              <Button variant="outline" onClick={onClose}>
                ביטול
              </Button>
            </div>
            {answers.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportLegacy}
                title="ייצא את התשובות המוכנות של השאלה הזו"
                className="text-amber-600 hover:bg-amber-50"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">ייצא</span>
              </Button>
            )}
          </div>

          {filteredAnswers.length > 0 && (
            <p className="text-xs text-neutral-500 text-center hidden sm:block">
              לחצו פעמיים על תשובה להכנסה מהירה
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
