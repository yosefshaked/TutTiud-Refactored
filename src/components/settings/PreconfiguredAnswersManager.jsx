import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * PreconfiguredAnswersManager - Allows admins/office workers to setup
 * preconfigured answers for text/textarea questions in the session form
 */
export default function PreconfiguredAnswersManager({
  questions = [],
  currentAnswers = {}, // { [questionId]: string[] }
  onSave,
  isLoading = false,
  capLimit = 50,
}) {
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editingAnswers, setEditingAnswers] = useState([]);
  const [newAnswer, setNewAnswer] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter to only text/textarea questions
  const editableQuestions = useMemo(() => {
    return questions.filter((q) => q.type === 'text' || q.type === 'textarea');
  }, [questions]);

  const handleEditQuestion = (question) => {
    const answers = currentAnswers[question.id] || [];
    setEditingQuestionId(question.id);
    setEditingAnswers(Array.isArray(answers) ? [...answers] : []);
    setNewAnswer('');
  };

  const handleAddAnswer = () => {
    const trimmed = newAnswer.trim();
    if (!trimmed) return;
    if (editingAnswers.includes(trimmed)) {
      toast.error('תשובה זו כבר קיימת');
      return;
    }
    if (editingAnswers.length >= capLimit) {
      toast.error(`לא ניתן להוסיף יותר מ-${capLimit} תשובות`);
      return;
    }
    setEditingAnswers([...editingAnswers, trimmed]);
    setNewAnswer('');
  };

  const handleRemoveAnswer = (index) => {
    setEditingAnswers(editingAnswers.filter((_, i) => i !== index));
  };

  const handleSaveAnswers = async () => {
    if (!editingQuestionId) return;
    setIsSaving(true);
    try {
      await onSave(editingQuestionId, editingAnswers);
      toast.success('התשובות נשמרו בהצלחה');
      setEditingQuestionId(null);
      setEditingAnswers([]);
      setNewAnswer('');
    } catch (error) {
      console.error('Failed to save preconfigured answers', error);
      toast.error('שמירת התשובות נכשלה');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setEditingQuestionId(null);
    setEditingAnswers([]);
    setNewAnswer('');
  };

  if (isLoading) {
    return (
      <Card className="w-full border-0 shadow-lg bg-white/80">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">תשובות מוכנות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (editableQuestions.length === 0) {
    return (
      <Card className="w-full border-0 shadow-lg bg-white/80">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">תשובות מוכנות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">
            אין שאלות טקסט או פסקה בטופס המפגש
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="w-full border-0 shadow-lg bg-white/80" dir="rtl">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg md:text-xl">תשובות מוכנות</CardTitle>
          <p className="text-xs text-slate-600 sm:text-sm mt-2">
            הגדירו תשובות מוכנות עבור שאלות טקסט בטופס המפגש. המדריכים והעובדים יוכלו לבחור מתוכן תשובות אלו בעת מילוי הטופס.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 pt-4 sm:pt-6">
          {editableQuestions.map((question) => {
            const answers = currentAnswers[question.id] || [];
            return (
              <div
                key={question.id}
                className="rounded-lg border border-slate-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-slate-900 text-right break-words">
                      {question.label}
                    </h3>
                    <p className="text-xs text-slate-500 text-right mt-1">
                      {answers.length} / {capLimit}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleEditQuestion(question)}
                    className="flex-shrink-0"
                  >
                    <Plus className="h-4 w-4 ml-1" />
                    ערוך
                  </Button>
                </div>
                {answers.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-end">
                    {answers.slice(0, 3).map((answer, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-xs max-w-xs truncate"
                      >
                        {answer}
                      </Badge>
                    ))}
                    {answers.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{answers.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={Boolean(editingQuestionId)} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-right">
              {editableQuestions.find((q) => q.id === editingQuestionId)?.label}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4" dir="rtl">
            {/* Input for new answer */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 text-right">
                הוסף תשובה חדשה
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddAnswer}
                  disabled={!newAnswer.trim() || editingAnswers.length >= capLimit}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  הוסף
                </Button>
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
                  disabled={editingAnswers.length >= capLimit}
                  className="text-right"
                />
              </div>
              {editingAnswers.length >= capLimit && (
                <p className="text-xs text-amber-600 text-right">
                  הגעת למקסימום {capLimit} תשובות
                </p>
              )}
            </div>

            {/* List of answers */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 text-right">
                תשובות ({editingAnswers.length} / {capLimit})
              </label>
              {editingAnswers.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  אין תשובות עדיין
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {editingAnswers.map((answer, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRemoveAnswer(idx)}
                        className="h-auto p-1 text-slate-500 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-slate-700 text-right flex-1 break-words">
                        {answer}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save button */}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isSaving}
              >
                ביטול
              </Button>
              <Button
                type="button"
                onClick={handleSaveAnswers}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
                שמור תשובות
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
