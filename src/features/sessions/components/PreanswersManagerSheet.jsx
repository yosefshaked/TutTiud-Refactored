import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Per-question preconfigured-answers manager.
 * Each mutation (add / edit / remove) is committed immediately via onSave —
 * no explicit "Save" button is needed.
 */
export default function PreanswersManagerSheet({
  open,
  onClose,
  question,
  answers = [],
  onSave,
  capLimit = 50,
}) {
  const [localAnswers, setLocalAnswers] = useState([]);
  const [newAnswer, setNewAnswer] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [expandedIndex, setExpandedIndex] = useState(null);

  // Reset local state whenever the target question changes
  useEffect(() => {
    setLocalAnswers(answers ? [...answers] : []);
    setNewAnswer('');
    setEditingIndex(null);
    setEditingValue('');
    setExpandedIndex(null);
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Persist a new list immediately. */
  const commit = (next) => {
    setLocalAnswers(next);
    onSave?.(next);
  };

  const handleAdd = () => {
    const trimmed = newAnswer.trim();
    if (!trimmed) return;
    if (localAnswers.includes(trimmed)) {
      toast.error('תשובה זו כבר קיימת');
      return;
    }
    if (localAnswers.length >= capLimit) {
      toast.error(`הגעת למגבלת ${capLimit} תשובות לשאלה זו`);
      return;
    }
    commit([...localAnswers, trimmed]);
    setNewAnswer('');
  };

  const handleRemove = (index) => {
    commit(localAnswers.filter((_, i) => i !== index));
  };

  const handleStartEdit = (index) => {
    setEditingIndex(index);
    setEditingValue(localAnswers[index]);
  };

  const handleConfirmEdit = () => {
    const trimmed = editingValue.trim();
    if (!trimmed) {
      toast.error('ערך לא יכול להיות ריק');
      return;
    }
    const others = localAnswers.filter((_, i) => i !== editingIndex);
    if (others.includes(trimmed)) {
      toast.error('תשובה זו כבר קיימת');
      return;
    }
    commit(localAnswers.map((a, i) => (i === editingIndex ? trimmed : a)));
    setEditingIndex(null);
    setEditingValue('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingValue('');
  };

  if (!question) return null;

  const atCap = localAnswers.length >= capLimit;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-full sm:max-w-md flex flex-col" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>תשובות מוכנות מראש</SheetTitle>
          <SheetDescription className="text-right">{question.label}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-3">
          {/* Add new answer */}
          <div className="flex gap-2" dir="rtl">
            <Input
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
              placeholder="הוסף תשובה חדשה..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
              className="flex-1 text-right"
              dir="rtl"
              disabled={atCap}
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newAnswer.trim() || atCap}
              className="flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-slate-500 text-right">
            {localAnswers.length}/{capLimit} תשובות
            {atCap && (
              <span className="text-amber-600 mr-2">— הגעת למגבלה</span>
            )}
          </p>

          {/* Answers list */}
          <div className="space-y-2">
            {localAnswers.length === 0 ? (
              <div className="text-center py-10 text-sm text-slate-400">
                אין תשובות מוכנות עדיין
              </div>
            ) : (
              localAnswers.map((answer, index) => (
                <div
                  key={index}
                  className={`flex gap-2 rounded-md border border-slate-200 bg-white p-2 ${
                    expandedIndex === index ? 'items-start' : 'items-center'
                  }`}
                  dir="rtl"
                >
                  {editingIndex === index ? (
                    <>
                      <Input
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmEdit();
                          if (e.key === 'Escape') handleCancelEdit();
                        }}
                        className="flex-1 h-7 text-sm text-right"
                        dir="rtl"
                        autoFocus
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleConfirmEdit}
                        className="h-7 w-7 text-green-600 flex-shrink-0"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCancelEdit}
                        className="h-7 w-7 text-slate-400 flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span
                        className={`flex-1 text-sm text-right cursor-pointer select-none ${
                          expandedIndex === index ? 'break-words whitespace-pre-wrap' : 'truncate'
                        }`}
                        dir="rtl"
                        title={expandedIndex === index ? undefined : answer}
                        onClick={() => setExpandedIndex(expandedIndex === index ? null : index)}
                      >
                        {answer}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleStartEdit(index)}
                        className="h-7 w-7 text-slate-500 flex-shrink-0"
                        title="ערוך"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleRemove(index)}
                        className="h-7 w-7 text-red-500 flex-shrink-0"
                        title="מחק"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
