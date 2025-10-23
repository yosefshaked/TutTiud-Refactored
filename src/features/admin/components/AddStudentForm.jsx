import React, { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const INITIAL_STATE = {
  name: '',
  contactInfo: '',
};

export default function AddStudentForm({ onSubmit, onCancel, isSubmitting = false, error = '' }) {
  const [values, setValues] = useState(INITIAL_STATE);
  const [touched, setTouched] = useState({ name: false });

  useEffect(() => {
    if (!isSubmitting && !error) {
      setValues(INITIAL_STATE);
      setTouched({ name: false });
    }
  }, [isSubmitting, error]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setTouched((previous) => ({
      ...previous,
      [name]: true,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedName = values.name.trim();

    if (!trimmedName) {
      setTouched((previous) => ({
        ...previous,
        name: true,
      }));
      return;
    }

    onSubmit({
      name: trimmedName,
      contactInfo: values.contactInfo.trim(),
    });
  };

  const showNameError = touched.name && !values.name.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="student-name">שם התלמיד *</Label>
        <Input
          id="student-name"
          name="name"
          value={values.name}
          onChange={handleChange}
          onBlur={handleBlur}
          required
          placeholder="הקלד את שם התלמיד"
          disabled={isSubmitting}
        />
        {showNameError ? (
          <p className="text-sm text-red-600" role="alert">
            יש להזין שם תלמיד.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-contact">פרטי קשר</Label>
        <Textarea
          id="student-contact"
          name="contactInfo"
          value={values.contactInfo}
          onChange={handleChange}
          placeholder="טלפון, אימייל או כל דרך התקשרות אחרת"
          rows={3}
          disabled={isSubmitting}
        />
        <p className="text-xs text-slate-500">
          פרטי הקשר יהיו זמינים לכל מנהלי הארגון ולמדריך המשויך.
        </p>
      </div>

      {error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          שמירת תלמיד חדש
        </Button>
      </div>
    </form>
  );
}
