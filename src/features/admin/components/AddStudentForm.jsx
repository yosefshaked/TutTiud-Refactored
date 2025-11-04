import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import {
  TextField,
  TextAreaField,
  SelectField,
  PhoneField,
  DayOfWeekField,
  ComboBoxField,
  TimeField
} from '@/components/ui/forms-ui';
import { validateIsraeliPhone } from '@/components/ui/helpers/phone';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { authenticatedFetch } from '@/lib/api-client';
import StudentTagsField from './StudentTagsField.jsx';
import { normalizeTagIdsForWrite } from '@/features/students/utils/tags.js';

const INITIAL_STATE = {
  name: '',
  contactName: '',
  contactPhone: '',
  assignedInstructorId: '',
  defaultService: '',
  defaultDayOfWeek: null,
  defaultSessionTime: null,
  notes: '',
  tagId: '',
};

export default function AddStudentForm({ onSubmit, onCancel, isSubmitting = false, error = '', renderFooterOutside = false }) {
  const [values, setValues] = useState(INITIAL_STATE);
  const [touched, setTouched] = useState({});
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [instructors, setInstructors] = useState([]);
  const [loadingInstructors, setLoadingInstructors] = useState(true);
  const { session } = useAuth();
  const { activeOrgId } = useOrg();

  useEffect(() => {
    if (!isSubmitting && !error) {
      setValues(INITIAL_STATE);
      setTouched({});
    }
  }, [isSubmitting, error]);

  useEffect(() => {
    async function loadServices() {
      if (!session || !activeOrgId) return;
      
      try {
        setLoadingServices(true);
        const searchParams = new URLSearchParams({ keys: 'available_services', org_id: activeOrgId });
        const payload = await authenticatedFetch(`settings?${searchParams.toString()}`, { session });
        const settingsValue = payload?.settings?.available_services;
        
        if (Array.isArray(settingsValue)) {
          setServices(settingsValue);
        } else {
          setServices([]);
        }
      } catch (err) {
        console.error('Failed to load services', err);
        setServices([]);
      } finally {
        setLoadingServices(false);
      }
    }
    async function loadInstructors() {
      if (!session || !activeOrgId) return;
      try {
        setLoadingInstructors(true);
        const searchParams = new URLSearchParams({ org_id: activeOrgId });
        const roster = await authenticatedFetch(`instructors?${searchParams.toString()}`, { session });
        // API returns only active instructors by default
        setInstructors(Array.isArray(roster) ? roster : []);
      } catch (err) {
        console.error('Failed to load instructors', err);
        setInstructors([]);
      } finally {
        setLoadingInstructors(false);
      }
    }

    loadServices();
    loadInstructors();
  }, [session, activeOrgId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setValues((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSelectChange = (name, value) => {
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

  const handleTagChange = useCallback((nextTagId) => {
    setValues((previous) => ({
      ...previous,
      tagId: nextTagId,
    }));
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();

    const newTouched = {
      name: true,
      contactName: true,
      contactPhone: true,
      assignedInstructorId: true,
      defaultDayOfWeek: true,
      defaultSessionTime: true,
    };
    setTouched(newTouched);

    const trimmedName = values.name.trim();
    const trimmedContactName = values.contactName.trim();
    const trimmedContactPhone = values.contactPhone.trim();

    if (!trimmedName || !trimmedContactName || !trimmedContactPhone || 
        !values.assignedInstructorId || !values.defaultDayOfWeek || !values.defaultSessionTime) {
      return;
    }

    if (!validateIsraeliPhone(trimmedContactPhone)) {
      return;
    }

    onSubmit({
      name: trimmedName,
      contactName: trimmedContactName,
      contactPhone: trimmedContactPhone,
      assignedInstructorId: values.assignedInstructorId,
      defaultService: values.defaultService || null,
      defaultDayOfWeek: values.defaultDayOfWeek,
      defaultSessionTime: values.defaultSessionTime,
      notes: values.notes.trim() || null,
      tags: normalizeTagIdsForWrite(values.tagId),
    });
  };

  const showNameError = touched.name && !values.name.trim();
  const showContactNameError = touched.contactName && !values.contactName.trim();
  const showContactPhoneError = touched.contactPhone && (!values.contactPhone.trim() || !validateIsraeliPhone(values.contactPhone));
  const showInstructorError = touched.assignedInstructorId && !values.assignedInstructorId;
  const showDayError = touched.defaultDayOfWeek && !values.defaultDayOfWeek;
  const showTimeError = touched.defaultSessionTime && !values.defaultSessionTime;

  return (
    <form id="add-student-form" onSubmit={handleSubmit} className="space-y-5" dir="rtl">
      <div className="space-y-5 divide-y divide-border">
        <div className="space-y-5 py-1">
          <TextField
        id="student-name"
        name="name"
        label="שם התלמיד"
        value={values.name}
        onChange={handleChange}
        onBlur={handleBlur}
        required
        placeholder="הקלד את שם התלמיד"
        disabled={isSubmitting}
        error={showNameError ? 'יש להזין שם תלמיד.' : ''}
      />

      <SelectField
        id="assigned-instructor"
        name="assignedInstructorId"
        label="מדריך משויך"
        value={values.assignedInstructorId}
        onChange={(value) => handleSelectChange('assignedInstructorId', value)}
        options={instructors.map((inst) => ({
          value: inst.id,
          label: inst.name || inst.email || inst.id,
        }))}
        placeholder={loadingInstructors ? 'טוען...' : 'בחר מדריך'}
        required
        disabled={isSubmitting || loadingInstructors}
        description="מוצגים רק מדריכים פעילים."
        error={showInstructorError ? 'יש לבחור מדריך.' : ''}
      />

      <TextField
        id="contact-name"
        name="contactName"
        label="שם איש קשר"
        value={values.contactName}
        onChange={handleChange}
        onBlur={handleBlur}
        required
        placeholder="שם הורה או אפוטרופוס"
        disabled={isSubmitting}
        error={showContactNameError ? 'יש להזין שם איש קשר.' : ''}
      />

      <PhoneField
        id="contact-phone"
        name="contactPhone"
        label="טלפון איש קשר"
        value={values.contactPhone}
        onChange={handleChange}
        onBlur={handleBlur}
        required
        disabled={isSubmitting}
        error={showContactPhoneError ? 'יש להזין מספר טלפון ישראלי תקין.' : ''}
      />
        </div>

        <div className="space-y-5 py-4">

      <ComboBoxField
        id="default-service"
        name="defaultService"
        label="שירות ברירת מחדל"
        value={values.defaultService}
        onChange={(value) => handleSelectChange('defaultService', value)}
        options={services}
        placeholder={loadingServices ? 'טוען...' : 'בחרו מהרשימה או הקלידו שירות'}
        disabled={isSubmitting || loadingServices}
        dir="rtl"
        emptyMessage="לא נמצאו שירותים תואמים"
        description="ניתן להגדיר שירותים זמינים בעמוד ההגדרות."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DayOfWeekField
          id="default-day"
          name="defaultDayOfWeek"
          label="יום קבוע"
          value={values.defaultDayOfWeek}
          onChange={(value) => handleSelectChange('defaultDayOfWeek', value)}
          required
          disabled={isSubmitting}
          error={showDayError ? 'יש לבחור יום.' : ''}
        />

        <TimeField
          id="default-time"
          name="defaultSessionTime"
          label="שעת מפגש קבועה"
          value={values.defaultSessionTime}
          onChange={(value) => handleSelectChange('defaultSessionTime', value)}
          disabled={isSubmitting}
          required
          error={showTimeError ? 'יש לבחור שעה.' : ''}
        />
      </div>

      <StudentTagsField
        value={values.tagId}
        onChange={handleTagChange}
        disabled={isSubmitting}
        description="תגיות לסינון וארגון תלמידים."
      />

      <TextAreaField
        id="notes"
        name="notes"
        label="הערות"
        value={values.notes}
        onChange={handleChange}
        placeholder="הערות נוספות על התלמיד"
        rows={3}
        disabled={isSubmitting}
      />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 text-right" role="alert">
          {error}
        </div>
      )}

      {!renderFooterOutside && (
        <div className="border-t -mx-4 sm:-mx-6 mt-6 pt-3 sm:pt-4 px-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
            <Button type="submit" disabled={isSubmitting} className="gap-2 shadow-md hover:shadow-lg transition-shadow">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              שמירת תלמיד חדש
            </Button>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="hover:shadow-sm">
              ביטול
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

export function AddStudentFormFooter({ onSubmit, onCancel, isSubmitting = false }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-end">
      <Button onClick={onSubmit} disabled={isSubmitting} className="gap-2 shadow-md hover:shadow-lg transition-shadow">
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        שמירת תלמיד חדש
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="hover:shadow-sm">
        ביטול
      </Button>
    </div>
  );
}

