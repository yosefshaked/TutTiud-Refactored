import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { describeSchedule } from '@/features/students/utils/schedule.js';

function todayIsoDate() {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function NewSessionForm({
  students = [],
  questions = [],
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
        initial[question.key] = '';
      }
    }
    return initial;
  });

  useEffect(() => {
    setAnswers((previous) => {
      const next = { ...previous };
      for (const question of questions) {
        if (question?.key && !Object.prototype.hasOwnProperty.call(next, question.key)) {
          next[question.key] = '';
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

  const handleAnswerChange = (questionKey) => (event) => {
    const value = event.target.value;
    setAnswers((previous) => ({
      ...previous,
      [questionKey]: value,
    }));
  };

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
      .map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
      .filter(([, value]) => !(typeof value === 'string' && value === ''));

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
          <Input
            id="session-service"
            value={serviceContext}
            onChange={handleServiceChange}
            placeholder="לדוגמה: שיעור פסנתר"
            disabled={isSubmitting}
          />
          <p className="text-xs text-neutral-500">הערך מוצע לפי ברירת המחדל של התלמיד אך ניתן לעריכה.</p>
        </div>
      </div>

      {questions.length ? (
        <div className="space-y-md">
          <h3 className="text-base font-semibold text-foreground">שאלות המפגש</h3>
          <div className="space-y-md">
            {questions.map((question) => (
              <div key={question.key} className="space-y-xs">
                <Label htmlFor={`question-${question.key}`}>{question.label}</Label>
                {question.type === 'textarea' ? (
                  <Textarea
                    id={`question-${question.key}`}
                    rows={4}
                    value={answers[question.key] ?? ''}
                    onChange={handleAnswerChange(question.key)}
                    disabled={isSubmitting}
                    placeholder={question.placeholder || ''}
                  />
                ) : (
                  <Input
                    id={`question-${question.key}`}
                    value={answers[question.key] ?? ''}
                    onChange={handleAnswerChange(question.key)}
                    disabled={isSubmitting}
                    placeholder={question.placeholder || ''}
                  />
                )}
              </div>
            ))}
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
