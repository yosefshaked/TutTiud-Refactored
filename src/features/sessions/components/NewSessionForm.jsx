import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { describeSchedule } from '@/features/students/utils/schedule.js';
import { cn } from '@/lib/utils.js';

function todayIsoDate() {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function NewSessionForm({
  students = [],
  questions = [],
  services = [],
  initialStudentId = '',
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = '',
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || '');
  const [sessionDate, setSessionDate] = useState(todayIsoDate());
  const [serviceContext, setServiceContext] = useState('');
  const [serviceTouched, setServiceTouched] = useState(false);
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

  const handleAnswerChange = useCallback((questionKey) => (event) => {
    const value = event.target.value;
    updateAnswer(questionKey, value);
  }, [updateAnswer]);

  const handleServiceChange = (event) => {
    setServiceTouched(true);
    setServiceContext(event.target.value);
  };

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
    <form className="space-y-lg" onSubmit={handleSubmit}>
      <div className="space-y-sm">
        <Label htmlFor="session-student">בחרו תלמיד *</Label>
        <select
          id="session-student"
          className="w-full rounded-lg border border-border bg-white p-sm text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={selectedStudentId}
          onChange={handleStudentChange}
          required
          disabled={isSubmitting || students.length === 0}
        >
          <option value="" disabled>
            בחרו תלמיד מהרשימה
          </option>
          {students.map((student) => {
            const schedule = describeSchedule(student?.default_day_of_week, student?.default_session_time);
            return (
              <option key={student.id} value={student.id}>
                {student.name || 'ללא שם'} — {schedule}
              </option>
            );
          })}
        </select>
        {students.length === 0 ? (
          <p className="text-xs text-neutral-500">אין תלמידים זמינים לשיוך מפגש חדש.</p>
        ) : null}
      </div>

      <div className="grid gap-md sm:grid-cols-2">
        <div className="space-y-sm">
          <Label htmlFor="session-date">תאריך המפגש *</Label>
          <Input
            id="session-date"
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
            required
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-sm">
          <Label htmlFor="session-service">שירות ברירת מחדל</Label>
          {Array.isArray(services) && services.length > 0 ? (
            <>
              <Input
                id="session-service"
                list="available-services"
                value={serviceContext}
                onChange={handleServiceChange}
                placeholder="בחרו מהרשימה או הקלידו שירות"
                disabled={isSubmitting}
              />
              <datalist id="available-services">
                {services.map((svc) => (
                  <option key={svc} value={svc} />
                ))}
              </datalist>
            </>
          ) : (
            <Input
              id="session-service"
              value={serviceContext}
              onChange={handleServiceChange}
              placeholder="לדוגמה: שיעור פסנתר"
              disabled={isSubmitting}
            />
          )}
          <p className="text-xs text-neutral-500">הערך מוצע לפי ברירת המחדל של התלמיד אך ניתן לעריכה.</p>
        </div>
      </div>

      {questions.length ? (
        <div className="space-y-md">
          <h3 className="text-base font-semibold text-foreground">שאלות המפגש</h3>
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
                    <Label htmlFor={questionId}>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Textarea
                      id={questionId}
                      rows={4}
                      value={answerValue ?? ''}
                      onChange={handleAnswerChange(question.key)}
                      disabled={isSubmitting}
                      placeholder={placeholder}
                      required={required}
                    />
                  </div>
                );
              }

              if (question.type === 'text') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId}>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Input
                      id={questionId}
                      value={answerValue ?? ''}
                      onChange={handleAnswerChange(question.key)}
                      disabled={isSubmitting}
                      placeholder={placeholder}
                      required={required}
                    />
                  </div>
                );
              }

              if (question.type === 'number') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId}>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Input
                      id={questionId}
                      type="number"
                      value={answerValue ?? ''}
                      onChange={handleAnswerChange(question.key)}
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
                    <Label htmlFor={questionId}>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <Input
                      id={questionId}
                      type="date"
                      value={answerValue ?? ''}
                      onChange={handleAnswerChange(question.key)}
                      disabled={isSubmitting}
                      required={required}
                    />
                  </div>
                );
              }

              if (question.type === 'select') {
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId}>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <select
                      id={questionId}
                      className="w-full rounded-lg border border-border bg-white p-sm text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                      value={answerValue ?? ''}
                      onChange={handleAnswerChange(question.key)}
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
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label>
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <div className="space-y-2" role="radiogroup" aria-required={required}>
                      {questionOptions.length === 0 ? (
                        <p className="text-xs text-neutral-500">אין אפשרויות זמינות לשאלה זו.</p>
                      ) : null}
                      {questionOptions.map((option, optionIndex) => {
                        const checked = answerValue === option.value;
                        const labelClass = cn(
                          'flex items-center gap-xs rounded-lg border px-sm py-xs text-sm transition-colors',
                          question.type === 'buttons'
                            ? 'cursor-pointer'
                            : 'cursor-pointer',
                          checked
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-white text-foreground'
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
                              className="h-4 w-4"
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
                    <Label htmlFor={questionId}>
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
                  <Label htmlFor={questionId}>
                    {question.label}
                    {required ? ' *' : ''}
                  </Label>
                  <Input
                    id={questionId}
                    value={answerValue ?? ''}
                    onChange={handleAnswerChange(question.key)}
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
        <div className="rounded-lg bg-red-50 p-md text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-sm sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button type="submit" disabled={isSubmitting || !selectedStudentId} className="gap-xs">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          שמירת מפגש
        </Button>
      </div>
    </form>
  );
}
