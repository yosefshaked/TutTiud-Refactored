import React, { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import IsraeliPhoneInput, { validateIsraeliPhone } from '@/components/ui/IsraeliPhoneInput';
import DayOfWeekSelect from '@/components/ui/DayOfWeekSelect';
import TimePickerInput from '@/components/ui/TimePickerInput';
import { useAuth } from '@/auth/AuthContext';
import { useOrganization } from '@/org/OrgProvider';
import { authenticatedFetch } from '@/lib/api-client';

const INITIAL_STATE = {
  name: '',
  contactName: '',
  contactPhone: '',
  defaultService: '',
  defaultDayOfWeek: null,
  defaultSessionTime: null,
  notes: '',
  tags: '',
};

export default function AddStudentForm({ onSubmit, onCancel, isSubmitting = false, error = '' }) {
  const [values, setValues] = useState(INITIAL_STATE);
  const [touched, setTouched] = useState({});
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const { session } = useAuth();
  const { activeOrgId } = useOrganization();

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
    
    loadServices();
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

  const handleSubmit = (event) => {
    event.preventDefault();
    
    const newTouched = {
      name: true,
      contactName: true,
      contactPhone: true,
      defaultDayOfWeek: true,
      defaultSessionTime: true,
    };
    setTouched(newTouched);

    const trimmedName = values.name.trim();
    const trimmedContactName = values.contactName.trim();
    const trimmedContactPhone = values.contactPhone.trim();

    if (!trimmedName || !trimmedContactName || !trimmedContactPhone || 
        !values.defaultDayOfWeek || !values.defaultSessionTime) {
      return;
    }

    if (!validateIsraeliPhone(trimmedContactPhone)) {
      return;
    }

    const tagsArray = values.tags
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    onSubmit({
      name: trimmedName,
      contactName: trimmedContactName,
      contactPhone: trimmedContactPhone,
      defaultService: values.defaultService || null,
      defaultDayOfWeek: values.defaultDayOfWeek,
      defaultSessionTime: values.defaultSessionTime,
      notes: values.notes.trim() || null,
      tags: tagsArray.length > 0 ? tagsArray : null,
    });
  };

  const showNameError = touched.name && !values.name.trim();
  const showContactNameError = touched.contactName && !values.contactName.trim();
  const showContactPhoneError = touched.contactPhone && (!values.contactPhone.trim() || !validateIsraeliPhone(values.contactPhone));
  const showDayError = touched.defaultDayOfWeek && !values.defaultDayOfWeek;
  const showTimeError = touched.defaultSessionTime && !values.defaultSessionTime;

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
        {showNameError && (
          <p className="text-sm text-red-600" role="alert">
            יש להזין שם תלמיד.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-name">שם איש קשר *</Label>
        <Input
          id="contact-name"
          name="contactName"
          value={values.contactName}
          onChange={handleChange}
          onBlur={handleBlur}
          required
          placeholder="שם הורה או אפוטרופוס"
          disabled={isSubmitting}
        />
        {showContactNameError && (
          <p className="text-sm text-red-600" role="alert">
            יש להזין שם איש קשר.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-phone">טלפון איש קשר *</Label>
        <IsraeliPhoneInput
          id="contact-phone"
          name="contactPhone"
          value={values.contactPhone}
          onChange={handleChange}
          onBlur={handleBlur}
          required
          disabled={isSubmitting}
          error={showContactPhoneError ? 'יש להזין מספר טלפון ישראלי תקין.' : ''}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="default-service">שירות ברירת מחדל</Label>
        <Select
          value={values.defaultService}
          onValueChange={(value) => handleSelectChange('defaultService', value)}
          disabled={isSubmitting || loadingServices}
        >
          <SelectTrigger id="default-service">
            <SelectValue placeholder={loadingServices ? 'טוען...' : 'בחר שירות'} />
          </SelectTrigger>
          <SelectContent>
            {services.map((service) => (
              <SelectItem key={service} value={service}>
                {service}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          ניתן להגדיר שירותים זמינים בעמוד ההגדרות.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="default-day">יום קבוע *</Label>
          <DayOfWeekSelect
            id="default-day"
            value={values.defaultDayOfWeek}
            onChange={(value) => handleSelectChange('defaultDayOfWeek', value)}
            disabled={isSubmitting}
            required
          />
          {showDayError && (
            <p className="text-sm text-red-600" role="alert">
              יש לבחור יום.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-time">שעת מפגש קבועה *</Label>
          <TimePickerInput
            id="default-time"
            value={values.defaultSessionTime}
            onChange={(value) => handleSelectChange('defaultSessionTime', value)}
            disabled={isSubmitting}
            required
          />
          {showTimeError && (
            <p className="text-sm text-red-600" role="alert">
              יש לבחור שעה.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">תגיות</Label>
        <Input
          id="tags"
          name="tags"
          value={values.tags}
          onChange={handleChange}
          placeholder="הפרד בפסיקים: תגית1, תגית2"
          disabled={isSubmitting}
        />
        <p className="text-xs text-slate-500">
          תגיות לסינון וארגון תלמידים.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">הערות</Label>
        <Textarea
          id="notes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          placeholder="הערות נוספות על התלמיד"
          rows={3}
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          ביטול
        </Button>
        <Button type="submit" disabled={isSubmitting} className="gap-2">
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          שמירת תלמיד חדש
        </Button>
      </div>
    </form>
  );
}

