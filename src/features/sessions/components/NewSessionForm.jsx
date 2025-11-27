import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Loader2, ListChecks, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ComboBoxField, TimeField } from '@/components/ui/forms-ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { describeSchedule, dayMatches, includesDayQuery } from '@/features/students/utils/schedule.js';
import { sortStudentsBySchedule } from '@/features/students/utils/sorting.js';
import { cn } from '@/lib/utils.js';
import DayOfWeekSelect from '@/components/ui/DayOfWeekSelect.jsx';
import PreanswersPickerDialog from './PreanswersPickerDialog.jsx';

export default function NewSessionForm({
  students = [],
  questions = [],
  suggestions = {},
  services = [],
  instructors = [],
  canFilterByInstructor = false,
  studentScope = 'all', // 'all' | 'mine' | `inst:<id>`
  onScopeChange,
  statusFilter = 'active',
  onStatusFilterChange,
  canViewInactive = false,
  visibilityLoaded = false,
  initialStudentId = '',
  initialDate = '', // YYYY-MM-DD format
  isLoadingStudents = false,
  onSubmit,
  onCancel,
  isSubmitting = false,
  error = '',
  renderFooterOutside = false, // New prop to control footer rendering
  onSelectedStudentChange, // Callback to notify parent of selection changes
  onFormValidityChange, // Callback to inform parent when form validity changes
  onSelectOpenChange, // Mobile fix: callback for Select open/close tracking
  formResetRef, // Ref to expose reset function to parent
  successState, // Success state from parent { studentId, studentName, date }
  showAdvancedFilters: externalShowAdvancedFilters, // Controlled from parent
  onShowAdvancedFiltersChange, // Callback to update parent state
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId || '');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentDayFilter, setStudentDayFilter] = useState(null);
  const [sessionDate, setSessionDate] = useState(initialDate || '');
  const [serviceContext, setServiceContext] = useState('');
  const [serviceTouched, setServiceTouched] = useState(false);
  const [preanswersDialogOpen, setPreanswersDialogOpen] = useState(false);
  const [activeQuestionKey, setActiveQuestionKey] = useState(null);
  const [isFormValid, setIsFormValid] = useState(false);
  const formRef = useRef(null);
  
  // Use controlled state from parent, or local state as fallback
  const showAdvancedFilters = externalShowAdvancedFilters ?? false;
  const setShowAdvancedFilters = onShowAdvancedFiltersChange ?? (() => {});
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
    onSelectedStudentChange?.(initialStudentId);
  }, [initialStudentId, onSelectedStudentChange]);

  const selectedStudent = useMemo(() => {
    return students.find((student) => student?.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Build instructor map for sorting
  const instructorMap = useMemo(() => {
    return instructors.reduce((map, instructor) => {
      if (instructor?.id) {
        map.set(instructor.id, instructor);
      }
      return map;
    }, new Map());
  }, [instructors]);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();

    // Server already filtered by scope (admin). For non-admin, list is already scoped to 'mine'.
    // We still apply day filter and text query locally for responsiveness.
    const byDay = students.filter((s) => dayMatches(s?.default_day_of_week, studentDayFilter));

    let filtered = byDay;
    if ((statusFilter === 'active' || (!canViewInactive && statusFilter !== 'active'))) {
      filtered = filtered.filter((s) => s?.is_active !== false);
    } else if (statusFilter === 'inactive') {
      filtered = filtered.filter((s) => s?.is_active === false);
    }
    if (q) {
      // Apply text query over the day-filtered list
      filtered = byDay.filter((s) => {
        try {
          const name = String(s?.name || '').toLowerCase();
          if (name.includes(q)) return true;

          const contactName = String(s?.contact_name || '').toLowerCase();
          if (contactName.includes(q)) return true;

          const contactPhone = String(s?.contact_phone || '').toLowerCase();
          if (contactPhone.includes(q)) return true;

          const contactInfo = String(s?.contact_info || '').toLowerCase();
          if (contactInfo.includes(q)) return true;

          if (includesDayQuery(s?.default_day_of_week, q)) return true;

          const timeStr = String(describeSchedule(null, s?.default_session_time) || '').toLowerCase();
          if (timeStr.includes(q)) return true;

          const fullSchedule = String(describeSchedule(s?.default_day_of_week, s?.default_session_time) || '').toLowerCase();
          if (fullSchedule.includes(q)) return true;

          return false;
        } catch {
          return false;
        }
      });
    }

    // Apply default sorting by schedule (day → hour → instructor → name)
    return sortStudentsBySchedule(filtered, instructorMap);
  }, [students, studentQuery, studentDayFilter, instructorMap, statusFilter, canViewInactive]);

  useEffect(() => {
    // If the currently selected student is filtered out, clear the selection
    // EXCEPTION: Don't clear if the student was pre-selected via initialStudentId
    // or while the students list is still loading to avoid clearing prematurely.
    if (!selectedStudentId) return;
    if (String(selectedStudentId) === String(initialStudentId)) return;
    if (isLoadingStudents) return;
    const stillVisible = filteredStudents.some((s) => s?.id === selectedStudentId);
    if (!stillVisible) {
      setSelectedStudentId('');
    }
  }, [filteredStudents, selectedStudentId, initialStudentId, isLoadingStudents]);

  useEffect(() => {
    if (!selectedStudent || serviceTouched) {
      return;
    }
    if (selectedStudent.default_service) {
      setServiceContext(selectedStudent.default_service);
    }
  }, [selectedStudent, serviceTouched]);

  const handleStudentChange = (value) => {
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

  const handleResetFilters = () => {
    setStudentQuery('');
    setStudentDayFilter(null);
    if (canViewInactive) {
      onStatusFilterChange?.('active');
    }
  };

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return studentQuery.trim() !== '' || studentDayFilter !== null || statusFilter !== 'active';
  }, [studentQuery, studentDayFilter, statusFilter]);

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

    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

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

  // Expose reset function to parent via ref
  useImperativeHandle(formResetRef, () => (options = {}) => {
    const { keepStudent = false, studentId = null } = options;
    
    // Reset all form fields
    const initialAnswers = {};
    for (const question of questions) {
      if (question?.key) {
        if (question.type === 'scale' && typeof question?.range?.min === 'number') {
          initialAnswers[question.key] = String(question.range.min);
        } else {
          initialAnswers[question.key] = '';
        }
      }
    }
    setAnswers(initialAnswers);
    setSessionDate('');
    
    // Preserve service context when keeping same student
    if (!keepStudent) {
      setServiceContext('');
      setServiceTouched(false);
    }
    
    setStudentQuery('');
    setStudentDayFilter(null);
    // Keep advanced filters state when creating additional reports (don't reset showAdvancedFilters)
    
    // Conditionally reset student selection
    if (keepStudent && studentId) {
      setSelectedStudentId(studentId);
      onSelectedStudentChange?.(studentId);
    } else {
      setSelectedStudentId('');
      onSelectedStudentChange?.('');
    }
  }, [questions, onSelectedStudentChange]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }
    const nextIsValid = form.checkValidity();
    if (isFormValid !== nextIsValid) {
      setIsFormValid(nextIsValid);
    }
    onFormValidityChange?.(nextIsValid);
  }, [selectedStudentId, sessionDate, answers, questions, onFormValidityChange, isFormValid]);

  return (
    <form
      id="new-session-form"
      ref={formRef}
      className="space-y-lg"
      onSubmit={handleSubmit}
      dir="rtl"
    >
      {successState && (
        <div className="rounded-lg bg-success-50 border-2 border-success-200 p-md text-center animate-in fade-in duration-300">
          <p className="text-base font-semibold text-success-700">
            ✓ מפגש עבור {successState.studentName} נשמר בהצלחה!
          </p>
          <p className="text-sm text-success-600 mt-1">
            בחרו פעולה מהתפריט מטה
          </p>
        </div>
      )}
      {!successState && (
      <>
      <div className="space-y-sm">
        <Label htmlFor="session-student" className="block text-right text-base font-semibold">בחרו תלמיד *</Label>
        <p className="text-xs text-neutral-500 text-right mb-3">השתמשו במסננים למטה כדי לצמצם את הרשימה</p>
        
        {/* Search Box - Always Visible */}
        <div className="mb-3 space-y-2 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p className="text-xs font-medium text-neutral-600 text-right mb-2">🔍 חיפוש</p>
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
        </div>

        {/* Advanced Filters Toggle Button */}
        <div className="flex items-center justify-between mb-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="gap-2 text-primary hover:text-primary/80"
            disabled={isSubmitting}
          >
            {showAdvancedFilters ? (
              <>
                <ChevronUp className="h-4 w-4" />
                <span>סינון מתקדם</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                <span>סינון מתקדם</span>
              </>
            )}
            {hasActiveFilters && !showAdvancedFilters && (
              <span className="inline-flex h-2 w-2 rounded-full bg-primary" title="יש מסננים פעילים" />
            )}
          </Button>
        </div>

        {/* Advanced Filters - Collapsible */}
        {showAdvancedFilters && (
          <div className="mb-3 space-y-2 p-3 bg-neutral-50 rounded-lg border border-neutral-200 animate-in fade-in slide-in-from-top-2 duration-200">
            <p className="text-xs font-medium text-neutral-600 text-right mb-2">⚙️ מסננים מתקדמים</p>
            <div className="flex flex-wrap items-end gap-2">
              {canFilterByInstructor ? (
                <div className="min-w-[200px] flex-1 sm:flex-none">
                  <Select
                    value={studentScope}
                    onValueChange={(v) => onScopeChange?.(v)}
                    onOpenChange={onSelectOpenChange}
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
              <div className="min-w-[160px] flex-1 sm:flex-none">
                <DayOfWeekSelect
                  value={studentDayFilter}
                  onChange={setStudentDayFilter}
                  disabled={isSubmitting || students.length === 0}
                  placeholder="סינון לפי יום"
                />
              </div>
              {canViewInactive ? (
                <div className="flex items-center gap-2">
                  <Label htmlFor="session-status-filter" className="text-sm text-neutral-600">
                    מצב:
                  </Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => onStatusFilterChange?.(value)}
                    onOpenChange={onSelectOpenChange}
                    disabled={isSubmitting || !visibilityLoaded}
                  >
                    <SelectTrigger id="session-status-filter" className="w-auto min-w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">תלמידים פעילים</SelectItem>
                      <SelectItem value="inactive">תלמידים לא פעילים</SelectItem>
                      <SelectItem value="all">הצג הכל</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {hasActiveFilters ? (
                <div className="flex-shrink-0 ltr:ml-auto rtl:mr-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="gap-xs"
                    disabled={isSubmitting}
                    title="נקה מסנני תלמיד"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">נקה מסננים</span>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}
        
        <div className="pt-2">
          <Label htmlFor="session-student-select" className="block text-right text-sm font-medium text-primary mb-2">
            ✓ בחירת תלמיד
          </Label>
          <Select
            value={selectedStudentId}
            onValueChange={handleStudentChange}
            onOpenChange={onSelectOpenChange}
            disabled={isSubmitting || filteredStudents.length === 0}
            required
          >
            <SelectTrigger id="session-student" className="w-full border-2 border-primary/30 bg-white shadow-sm hover:border-primary/50 focus:border-primary">
              <SelectValue placeholder="בחרו תלמיד מהרשימה" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {filteredStudents.map((student) => {
                const schedule = describeSchedule(student?.default_day_of_week, student?.default_session_time);
                return (
                  <SelectItem key={student.id} value={student.id}>
                    {student.name || 'ללא שם'} — {schedule}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
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
                // Check for preanswers by both key and id
                const preanswersByKey = Array.isArray(suggestions?.[question.key]) ? suggestions[question.key] : [];
                const preanswersById = Array.isArray(suggestions?.[question.id]) ? suggestions[question.id] : [];
                const preanswers = preanswersByKey.length > 0 ? preanswersByKey : preanswersById;
                const hasPreanswers = preanswers.length > 0;
                
                return (
                  <div key={question.key} className="space-y-xs">
                    <Label htmlFor={questionId} className="block text-right">
                      {question.label}
                      {required ? ' *' : ''}
                    </Label>
                    <div className="relative">
                      <Textarea
                        id={questionId}
                        rows={4}
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
                          className="absolute left-1 top-1 h-8 px-2"
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

              if (question.type === 'text') {
                // Check for preanswers by both key and id
                const preanswersByKey = Array.isArray(suggestions?.[question.key]) ? suggestions[question.key] : [];
                const preanswersById = Array.isArray(suggestions?.[question.id]) ? suggestions[question.id] : [];
                const preanswers = preanswersByKey.length > 0 ? preanswersByKey : preanswersById;
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
                    <Select
                      value={answerValue ?? ''}
                      onValueChange={(value) => updateAnswer(question.key, value)}
                      onOpenChange={onSelectOpenChange}
                      disabled={isSubmitting || questionOptions.length === 0}
                      required={required}
                    >
                      <SelectTrigger id={questionId} className="w-full">
                        <SelectValue placeholder="בחרו אפשרות" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {questionOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
            <Button type="submit" disabled={isSubmitting || !isFormValid} className="gap-xs shadow-md hover:shadow-lg transition-shadow">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              שמירת מפגש
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="hover:shadow-sm">
              ביטול
            </Button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Preconfigured Answers Picker Dialog */}
      <PreanswersPickerDialog
        open={preanswersDialogOpen}
        onClose={() => {
          setPreanswersDialogOpen(false);
          setActiveQuestionKey(null);
        }}
        answers={(() => {
          if (!activeQuestionKey) return [];
          const question = questions.find((q) => q.key === activeQuestionKey);
          if (!question) return [];
          // Check by both key and id
          const byKey = Array.isArray(suggestions?.[question.key]) ? suggestions[question.key] : [];
          const byId = Array.isArray(suggestions?.[question.id]) ? suggestions[question.id] : [];
          return byKey.length > 0 ? byKey : byId;
        })()}
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
export function NewSessionFormFooter({ onSubmit, onCancel, isSubmitting = false, isFormValid = false }) {
  return (
    <div className="flex flex-col-reverse gap-sm sm:flex-row-reverse sm:justify-end">
      <Button type="submit" disabled={isSubmitting || !isFormValid} className="gap-xs shadow-md hover:shadow-lg transition-shadow" onClick={onSubmit}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        שמירת מפגש
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="hover:shadow-sm">
        ביטול
      </Button>
    </div>
  );
}

