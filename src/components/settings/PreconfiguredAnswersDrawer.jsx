import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, X, Save, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils.js';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * PreconfiguredAnswersDrawer - Side drawer for managing preconfigured answers for a specific question
 * Similar to the heatmap session list drawer pattern
 * Supports copying answers from other questions
 */
export default function PreconfiguredAnswersDrawer({
  open,
  onClose,
  question,
  currentAnswers = [],
  onSave,
  isLoading = false,
  capLimit = 50,
  allQuestions = [],
  allPreanswers = {},
}) {
  const [answers, setAnswers] = useState([]);
  const [newAnswer, setNewAnswer] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [copySourceId, setCopySourceId] = useState('');

  useEffect(() => {
    if (open) {
      setAnswers(Array.isArray(currentAnswers) ? [...currentAnswers] : []);
      setNewAnswer('');
      setCopySourceId('');
    }
  }, [open, currentAnswers]);

  const handleAddAnswer = () => {
    const trimmed = newAnswer.trim();
    if (!trimmed) return;
    if (answers.includes(trimmed)) {
      toast.error('תשובה זו כבר קיימת');
      return;
    }
    if (answers.length >= capLimit) {
      toast.error(`לא ניתן להוסיף יותר מ-${capLimit} תשובות`);
      return;
    }
    setAnswers([...answers, trimmed]);
    setNewAnswer('');
  };

  const handleRemoveAnswer = (index) => {
    setAnswers(answers.filter((_, i) => i !== index));
  };

  const handleCopyFromQuestion = () => {
    if (!copySourceId) {
      toast.error('בחר שאלה להעתקה');
      return;
    }

    const sourceAnswers = allPreanswers[copySourceId];
    if (!sourceAnswers || !Array.isArray(sourceAnswers) || sourceAnswers.length === 0) {
      toast.error('אין תשובות להעתקה מהשאלה הזו');
      return;
    }

    // Merge source answers with current, avoiding duplicates
    const merged = [...answers];
    const seen = new Set(merged);
    let added = 0;

    for (const answer of sourceAnswers) {
      if (typeof answer !== 'string') continue;
      const trimmed = answer.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      if (merged.length >= capLimit) break;
      seen.add(trimmed);
      merged.push(trimmed);
      added++;
    }

    if (added === 0) {
      toast.info('כל התשובות כבר קיימות');
      return;
    }

    setAnswers(merged);
    setCopySourceId('');
    toast.success(`הועתקו ${added} תשובות`);
  };

  const handleSaveAnswers = async () => {
    setIsSaving(true);
    try {
      await onSave(question.id, answers);
      toast.success('התשובות נשמרו בהצלחה');
      onClose();
    } catch (error) {
      console.error('Failed to save preconfigured answers', error);
      toast.error('שמירת התשובות נכשלה');
    } finally {
      setIsSaving(false);
    }
  };

  if (!question) return null;

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 z-50 h-screen w-full sm:w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-6 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-slate-100"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex-1 text-right pr-3">
            <h2 className="font-semibold text-slate-900">{question.label}</h2>
            <p className="text-xs text-slate-500 mt-1">תשובות מוכנות</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Add new answer section */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">הוסף תשובה חדשה</label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="הקלד תשובה..."
                value={newAnswer}
                onChange={(e) => setNewAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddAnswer();
                  }
                }}
                disabled={answers.length >= capLimit || isLoading}
                className="text-right"
              />
              <Button
                type="button"
                size="sm"
                onClick={handleAddAnswer}
                disabled={!newAnswer.trim() || answers.length >= capLimit || isLoading}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {answers.length >= capLimit && (
              <p className="text-xs text-amber-600">הגעת למקסימום {capLimit} תשובות</p>
            )}
          </div>

          {/* Copy from another question */}
          {allQuestions.length > 1 && (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <label className="block text-xs font-medium text-blue-900">העתק מ שאלה אחרת</label>
              <div className="flex gap-2">
                <Select value={copySourceId} onValueChange={setCopySourceId}>
                  <SelectTrigger className="text-sm text-right bg-white">
                    <SelectValue placeholder="בחר שאלה..." />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    {allQuestions
                      .filter((q) => q.id !== question.id && (q.type === 'text' || q.type === 'textarea'))
                      .map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyFromQuestion}
                  disabled={!copySourceId || isLoading || answers.length >= capLimit}
                  className="whitespace-nowrap"
                >
                  <Copy className="h-3 w-3 ml-1" />
                  העתק
                </Button>
              </div>
            </div>
          )}

          {/* Answers list */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              תשובות ({answers.length} / {capLimit})
            </label>
            {answers.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                אין תשובות עדיין
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {answers.map((answer, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 hover:border-slate-300 transition-colors"
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveAnswer(idx)}
                      className="h-auto p-1 text-slate-500 hover:text-red-600"
                      disabled={isLoading || isSaving}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-slate-700 text-right flex-1 break-words">{answer}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end border-t border-slate-200 p-4 sm:p-6 flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving || isLoading}
          >
            ביטול
          </Button>
          <Button
            type="button"
            onClick={handleSaveAnswers}
            disabled={isSaving || isLoading}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                שומר...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 ml-2" />
                שמור תשובות
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
