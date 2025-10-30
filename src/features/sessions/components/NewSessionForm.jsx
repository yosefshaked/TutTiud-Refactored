import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ComboBoxField, TimeField } from '@/components/ui/forms-ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeSchedule, dayMatches, includesDayQuery } from '@/features/students/utils/schedule.js';
import { cn } from '@/lib/utils.js';
import DayOfWeekSelect from '@/components/ui/DayOfWeekSelect.jsx';
import PreanswersPickerDialog from './PreanswersPickerDialog.jsx';

function todayIsoDate() {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function NewSessionForm({
  students = [],
  questions = [],
  suggestions = {},
  services = [],
  instructors = [],
  canFilterByInstructor = false,
  studentScope = 'all', // 'all' | 'mine' | `inst:<id>`
  onScopeChange,
  initialStudentId = '',
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = '',
  renderFooterOutside = false, // New prop to control footer rendering
  onSelectedStudentChange, // Callback to notify parent of selection changes
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || '');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentDayFilter, setStudentDayFilter] = useState(null);
  const [sessionDate, setSessionDate] = useState(todayIsoDate());
  const [serviceContext, setServiceContext] = useState('');
  const [serviceTouched, setServiceTouched] = useState(false);
  const [preanswersDialogOpen, setPreanswersDialogOpen] = useState(false);
  const [activeQuestionKey, setActiveQuestionKey] = useState(null);
  const [answers, setAnswers] = useState(() => {
    const initial = {};
    for (const question of questions) {
      if (question?.key) {
        if (question.type === 'scale' && typeof question?.range?.min === 'number') {
          initial[question.key] = String(question.range.min);
        } else {
          initial[question.key] = '';
        }
      }
    }
    return initial;
  });

  useEffect(() => {
    setAnswers((previous) => {
      const next = { ...previous };
      const keys = new Set();
      for (const question of questions) {
        if (!question?.key) {
          continue;
        }
        keys.add(question.key);
        if (!Object.prototype.hasOwnProperty.call(next, question.key)) {
          if (question.type === 'scale' && typeof question?.range?.min === 'number') {
            next[question.key] = String(question.range.min);
          } else {
            next[question.key] = '';
          }
        }
      }
      for (const existingKey of Object.keys(next)) {
        if (!keys.has(existingKey)) {
          delete next[existingKey];
        }
      }
      return next;
    });
  }, [questions]);

  useEffect(() => {
    if (!initialStudentId) {
      return;
    }
    setSelectedStudentId(initialStudentId);
  }, [initialStudentId]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student?.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();

    // Server already filtered by scope (admin). For non-admin, list is already scoped to 'mine'.
    // We still apply day filter and text query locally for responsiveness.
    const byDay = students.filter((s) => dayMatches(s?.default_day_of_week, studentDayFilter));

    if (!q) return byDay;

    // Then apply text query over the day-filtered list
    return byDay.filter((s) => {
      try {
        const name = String(s?.name || '').toLowerCase();
        if (name.includes(q)) return true;

  // Match by Hebrew day label (e.g., "יום שני")
  if (includesDayQuery(s?.default_day_of_week, q)) return true;

        // Match by time (e.g., 14:30)
        const timeStr = String(describeSchedule(null, s?.default_session_time) || '').toLowerCase();
        if (timeStr.includes(q)) return true;

        // Also match full schedule text
        const fullSchedule = String(describeSchedule(s?.default_day_of_week, s?.default_session_time) || '').toLowerCase();
        if (fullSchedule.includes(q)) return true;

        return false;
      } catch {
        return false;
      }
    });
  }, [students, studentQuery, studentDayFilter]);

  useEffect(() => {
    // If the currently selected student is filtered out, clear the selection
    if (!selectedStudentId) return;
    const stillVisible = filteredStudents.some((s) => s?.id === selectedStudentId);
    if (!stillVisible) {
      setSelectedStudentId('');
    }
  }, [filteredStudents, selectedStudentId]);

  useEffect(() => {
    if (!selectedStudent || serviceTouched) {
      return;
    }
    if (selectedStudent.default_service) {
      setServiceContext(selectedStudent.default_service);
    }
  }, [selectedStudent, serviceTouched]);

  const handleStudentChange = (event) => {
    const value = event.target.value;
    setSelectedStudentId(value);
    onSelectedStudentChange?.(value); // Notify parent
    setServiceTouched(false);
    const nextStudent = students.find((student) => student?.id === value);
    if (nextStudent?.default_service) {
      setServiceContext(nextStudent.default_service);
    } else {
      setServiceContext('');
    }
  };

  const updateAnswer = useCallback((questionKey, value) => {
    setAnswers((previous) => ({
      ...previous,
      [questionKey]: value,
    }));
  }, []);

  const handleAnswerChange = useCallback((questionKey, event) => {
    const value = event.target.value;
    updateAnswer(questionKey, value);
  }, [updateAnswer]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!selectedStudentId) {
      return;
    }

    const trimmedService = serviceContext.trim();
    const answerEntries = Object.entries(answers)
      .map(([key, value]) => {
        if (typeof value === 'string') {
          return [key, value.trim()];
        }
        return [key, value];
      })
      .filter(([, value]) => {
        if (typeof value === 'string') {
          return value !== '';
        }
        return value !== null && typeof value !== 'undefined';
      });

    const payload = {
      studentId: selectedStudentId,
      date: sessionDate,
      serviceContext: trimmedService || null,
      answers: Object.fromEntries(answerEntries),
    };

    onSubmit?.(payload);
  };

  return (
    <form id="new-session-form" className="space-y-lg" onSubmit={handleSubmit} dir="rtl">
      <div className="space-y-sm">
        <Label htmlFor="session-student" className="block text-right">בחרו תלמיד *</Label>
        <div className={cn(
          'mb-2 grid grid-cols-1 gap-2',
          canFilterByInstructor ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        )}>
          <div className="relative">
            <Input
              type="text"
              placeholder="חיפוש לפי שם, יום או שעה..."
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              className="w-full pr-3 text-sm"
              disabled={isSubmitting || students.length === 0}
              aria-label="חיפוש תלמיד"
            />
          </div>
          {canFilterByInstructor ? (
            <div>
              <Select
                value={studentScope}
                onValueChange={(v) => onScopeChange?.(v)}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="כל התלמידים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל התלמידים</SelectItem>
                  {/* 'mine' option is still useful for admins who are also instructors */}
                  <SelectItem value="mine">התלמידים שלי</SelectItem>
                  {instructors.map((inst) => (
                    <SelectItem key={inst.id} value={`inst:${inst.id}`}>
                      התלמידים של {inst.name || inst.email || inst.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div>
            <DayOfWeekSelect
              value={studentDayFilter}
              onChange={setStudentDayFilter}
              disabled={isSubmitting || students.length === 0}
              placeholder="סינון לפי יום"
            />
          </div>
        </div>
        <select
          id="session-student"
          className="w-full rounded-lg border border-border bg-white p-sm text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={selectedStudentId}
          onChange={handleStudentChange}
          required
          disabled={isSubmitting || filteredStudents.length === 0}
        >
          <option value="" disabled>
            בחרו תלמיד מהרשימה
          </option>
          {filteredStudents.map((student) => {
            const schedule = describeSchedule(student?.default_day_of_week, student?.default_session_time);
            return (
              <option key={student.id} value={student.id}>
                {student.name || 'ללא שם'} — {schedule}
              </option>
            );
          })}
        </select>
        {students.length === 0 ? (
          <p className="text-xs text-neutral-500 text-right">אין תלמידים זמינים לשיוך מפגש חדש.</p>
        ) : filteredStudents.length === 0 ? (
          <p className="text-xs text-neutral-500 text-right">לא נמצאו תלמידים התואמים את החיפוש.</p>
        ) : null}
      </div>

      <div className="grid gap-md sm:grid-cols-2">
        <div className="space-y-sm">
          <Label htmlFor="session-date" className="block text-right">תאריך המפגש *</Label>
          <Input
            id="session-date"
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        <ComboBoxField
          id="session-service"
          name="service"
          label="שירות ברירת מחדל"
          value={serviceContext}
          onChange={setServiceContext}
          options={services}
          placeholder="בחרו מהרשימה או הקלידו שירות"
          disabled={isSubmitting}
          dir="rtl"
          emptyMessage="לא נמצאו שירותים תואמים"
          description="הערך מוצע לפי ברירת המחדל של התלמיד אך ניתן לעריכה."
        />
      </div>

      {questions.length ? (
        <div className="space-y-md">
          <h3 className="text-base font-semibold text-foreground text-right">שאלות המפגש</h3>
          <div className="space-y-md">
            {questions.map((question) => {
              const questionId = `question-${question.key}`;
              const questionOptions = Array.isArray(question.options)
                ? question.options
                  .map((option) => {
                    const value = typeof option?.value === 'string' ? option.value.trim() : '';
                    const label = typeof option?.label === 'string' ? option.label.trim() : value;
                    if (!value || !label) {
                      return null;
                    }
                    return { value, label };
                  })
                  .filter(Boolean)
                : [];
              const required = Boolean(question.required);
              const placeholder = typeof question.placeholder === 'string' ? question.placeholder : '';
              const answerValue = answers[question.key];

              if (question.type === 'textarea') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Textarea
                      id={questionId}
                      rows={4}
                      value={answerValue ?? ''}
                      onChange={(e) => handleAnswerChange(question.key, e)}
                      disabled={isSubmitting}
                      placeholder={placeholder}
                      required={required}
                    />
                    {Array.isArray(suggestions?.[question.key]) && suggestions[question.key].length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {suggestions[question.key].map((sugg) => (
                          <button
                            key={`${question.key}-sugg-${sugg}`}
                            type="button"
                            className="rounded-full border px-2 py-0.5 text-xs hover:bg-neutral-50"
                            onClick={() => updateAnswer(question.key, sugg)}
                            disabled={isSubmitting}
                            title="הכנס תשובה מוכנה"
                          >
                            {sugg}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (question.type === 'text') {
                const preanswers = Array.isArray(suggestions?.[question.key]) ? suggestions[question.key] : [];
                const hasPreanswers = preanswers.length > 0;
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <div className="relative">
                      <Input
                        id={questionId}
                        value={answerValue ?? ''}
                        onChange={(e) => handleAnswerChange(question.key, e)}
                        disabled={isSubmitting}
                        placeholder={placeholder}
                        required={required}
                        className={hasPreanswers ? 'pl-12' : ''}
                      />
                      {hasPreanswers && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute left-1 top-1/2 -translate-y-1/2 h-8 px-2"
                          onClick={() => {
                            setActiveQuestionKey(question.key);
                            setPreanswersDialogOpen(true);
                          }}
                          disabled={isSubmitting}
                          title="בחר תשובה מוכנה"
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {!hasPreanswers && (
                      <p className="text-xs text-neutral-500 text-right">
                        אין תשובות מוכנות לשאלה זו. בקשו ממנהלי המערכת להגדיר תשובות מוכנות.
                      </p>
                    )}
                  </div>
                );
              }

              if (question.type === 'number') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Input
                      id={questionId}
                      type="number"
                      value={answerValue ?? ''}
                      onChange={(e) => handleAnswerChange(question.key, e)}
                      disabled={isSubmitting}
                      placeholder={placeholder}
                      required={required}
                    />
                  </div>
                );
              }

              if (question.type === 'date') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Input
                      id={questionId}
                      type="date"
                      value={answerValue ?? ''}
                      onChange={(e) => handleAnswerChange(question.key, e)}
                      disabled={isSubmitting}
                      required={required}
                    />
                  </div>
                );
              }

              if (question.type === 'select') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <select
                      id={questionId}
                      className="w-full rounded-lg border border-border bg-white p-sm text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={answerValue ?? ''}
                      onChange={(e) => handleAnswerChange(question.key, e)}
                      disabled={isSubmitting || questionOptions.length === 0}
                      required={required}
                    >
                      <option value="" disabled>
                        בחרו אפשרות
                      </option>
                      {questionOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {questionOptions.length === 0 ? (
                      <p className="text-xs text-neutral-500">אין אפשרויות זמינות לשאלה זו.</p>
                    ) : null}
                  </div>
                );
              }

              if (question.type === 'radio' || question.type === 'buttons') {
                const isButtonStyle = question.type === 'buttons';
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <div 
                      className={cn(
                        'gap-2',
                        isButtonStyle ? 'flex flex-wrap' : 'space-y-2'
                      )} 
                      role="radiogroup" 
                      aria-required={required}
                    >
                      {questionOptions.length === 0 ? (
                        <p className="text-xs text-neutral-500">אין אפשרויות זמינות לשאלה זו.</p>
                      ) : null}
                      {questionOptions.map((option, optionIndex) => {
                        const checked = answerValue === option.value;
                        const labelClass = cn(
                          'flex items-center gap-xs text-sm transition-all',
                          isButtonStyle
                            ? cn(
                                // Button style: hide radio, make whole area clickable
                                'cursor-pointer rounded-lg border-2 px-md py-sm font-medium shadow-sm hover:shadow-md',
                                checked
                                  ? 'border-primary bg-primary text-white shadow-md'
                                  : 'border-neutral-300 bg-white text-foreground hover:border-primary/50 hover:bg-primary/5'
                              )
                            : cn(
                                // Traditional radio style: visible radio button
                                'cursor-pointer rounded-lg border px-sm py-xs',
                                checked
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border bg-white text-foreground hover:bg-neutral-50'
                              )
                        );
                        return (
                          <label key={option.value} className={labelClass}>
                            <input
                              type="radio"
                              name={question.key}
                              value={option.value}
                              checked={checked}
                              onChange={() => updateAnswer(question.key, option.value)}
                              required={required && optionIndex === 0}
                              disabled={isSubmitting}
                              className={cn(
                                'h-4 w-4',
                                isButtonStyle && 'sr-only' // Hide radio button for button style
                              )}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              if (question.type === 'scale') {
                const min = typeof question?.range?.min === 'number' ? question.range.min : 0;
                const max = typeof question?.range?.max === 'number' ? question.range.max : 5;
                const step = typeof question?.range?.step === 'number' && question.range.step > 0 ? question.range.step : 1;
                const sliderValue = answerValue !== undefined && answerValue !== ''
                  ? Number(answerValue)
                  : min;
                return (
                  <div key={question.key} className="space-y-2">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <div className="flex items-center gap-sm">
                      <span className="text-xs text-neutral-500">{min}</span>
                      <input
                        id={questionId}
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={sliderValue}
                        onChange={(event) => updateAnswer(question.key, event.target.value)}
                        disabled={isSubmitting}
                        className="flex-1"
                      />
                      <span className="text-xs text-neutral-500">{max}</span>
                    </div>
                    <div className="text-xs text-neutral-600">ערך שנבחר: {sliderValue}</div>
                  </div>
                );
              }

              return (
                <div key={question.key} className="space-y-xs">
                  <Label htmlFor={questionId} className="block text-right">
                    {question.label}
                    {required ? ' *' : ''}
                  </Label>
                  <Input
                    id={questionId}
                    value={answerValue ?? ''}
                    onChange={(e) => handleAnswerChange(question.key, e)}
                    disabled={isSubmitting}
                    placeholder={placeholder}
                    required={required}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg bg-red-50 p-md text-sm text-red-700 text-right" role="alert">
          {error}
        </div>
      ) : null}

      {!renderFooterOutside && (
        <div className="border-t -mx-4 sm:-mx-6 mt-6 pt-3 sm:pt-4 px-4 sm:px-6">
          <div className="flex flex-col-reverse gap-sm sm:flex-row-reverse sm:justify-end">
            <Button type="submit" disabled={isSubmitting || !selectedStudentId} className="gap-xs shadow-md hover:shadow-lg transition-shadow">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              שמירת מפגש
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="hover:shadow-sm">
              ביטול
            </Button>
          </div>
        </div>
      )}

      {/* Preconfigured Answers Picker Dialog */}
      <PreanswersPickerDialog
        open={preanswersDialogOpen}
        onClose={() => {
          setPreanswersDialogOpen(false);
          setActiveQuestionKey(null);
        }}
        answers={activeQuestionKey ? (suggestions?.[activeQuestionKey] || []) : []}
        onSelect={(answer) => {
          if (activeQuestionKey) {
            updateAnswer(activeQuestionKey, answer);
          }
        }}
        questionLabel={
          activeQuestionKey
            ? questions.find((q) => q.key === activeQuestionKey)?.label || 'שאלה'
            : 'שאלה'
        }
      />
    </form>
  );
}

// Export footer component for external rendering
export function NewSessionFormFooter({ onSubmit, onCancel, isSubmitting = false, selectedStudentId }) {
  return (
    <div className="flex flex-col-reverse gap-sm sm:flex-row-reverse sm:justify-end">
      <Button type="submit" disabled={isSubmitting || !selectedStudentId} className="gap-xs shadow-md hover:shadow-lg transition-shadow" onClick={onSubmit}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        שמירת מפגש
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="hover:shadow-sm">
        ביטול
      </Button>
    </div>
  );
}

