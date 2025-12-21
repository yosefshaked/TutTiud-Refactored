import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { fetchSettings, upsertSettings } from '@/features/settings/api/settings.js';

const DEFAULT_MAPPING = {
  student_name: '',
  national_id: '',
  contact_name: '',
  contact_phone: '',
  health_provider_tag: '',
};

const FIELD_LABELS = {
  student_name: 'שם תלמיד (Source Key)',
  national_id: 'מספר זהות (Source Key)',
  contact_name: 'שם איש קשר (Source Key)',
  contact_phone: 'טלפון איש קשר (Source Key)',
  health_provider_tag: 'תג ספק שירות/קופת חולים (Source Key)',
};

function normalizeMapping(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_MAPPING };
  }
  return {
    student_name: typeof value.student_name === 'string' ? value.student_name : '',
    national_id: typeof value.national_id === 'string' ? value.national_id : '',
    contact_name: typeof value.contact_name === 'string' ? value.contact_name : '',
    contact_phone: typeof value.contact_phone === 'string' ? value.contact_phone : '',
    health_provider_tag: typeof value.health_provider_tag === 'string' ? value.health_provider_tag : '',
  };
}

function generateSecretValue() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}${Math.random().toString(16).slice(2, 10)}`;
}

export default function IntakeSettingsCard({ session, orgId, activeOrgHasConnection }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [mapping, setMapping] = useState({ ...DEFAULT_MAPPING });
  const [secret, setSecret] = useState('');
  const [initialMapping, setInitialMapping] = useState({ ...DEFAULT_MAPPING });
  const [initialSecret, setInitialSecret] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      if (!session || !orgId || !activeOrgHasConnection) {
        if (!cancelled) {
          setIsLoading(false);
          setMapping({ ...DEFAULT_MAPPING });
          setSecret('');
          setInitialMapping({ ...DEFAULT_MAPPING });
          setInitialSecret('');
          setError('');
        }
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const settings = await fetchSettings({ session, orgId });
        if (cancelled) {
          return;
        }
        const nextMapping = normalizeMapping(settings?.intake_field_mapping);
        const nextSecret = typeof settings?.external_intake_secret === 'string'
          ? settings.external_intake_secret
          : '';
        setMapping(nextMapping);
        setSecret(nextSecret);
        setInitialMapping(nextMapping);
        setInitialSecret(nextSecret);
      } catch (loadError) {
        console.error('Failed to load intake settings', loadError);
        if (!cancelled) {
          setError('טעינת הגדרות קליטת תלמידים נכשלה. נסו שוב.');
          setMapping({ ...DEFAULT_MAPPING });
          setSecret('');
          setInitialMapping({ ...DEFAULT_MAPPING });
          setInitialSecret('');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [session, orgId, activeOrgHasConnection]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(mapping) !== JSON.stringify(initialMapping) || secret !== initialSecret;
  }, [mapping, initialMapping, secret, initialSecret]);

  const handleFieldChange = (field) => (event) => {
    const value = event.target.value;
    setMapping((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegenerateSecret = () => {
    const nextSecret = generateSecretValue();
    setSecret(nextSecret);
  };

  const handleSave = async () => {
    if (!session || !orgId) {
      toast.error('נדרשת התחברות פעילה כדי לשמור את ההגדרות.');
      return;
    }
    if (!activeOrgHasConnection) {
      toast.error('יש להשלים חיבור למסד הנתונים לפני שמירה.');
      return;
    }
    if (!secret.trim()) {
      setError('יש להזין סוד חיצוני לפני שמירה.');
      toast.error('חסר סוד חיצוני לשמירה.');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      await upsertSettings({
        session,
        orgId,
        settings: {
          intake_field_mapping: mapping,
          external_intake_secret: secret.trim(),
        },
      });
      setInitialMapping(mapping);
      setInitialSecret(secret.trim());
      toast.success('הגדרות הקליטה נשמרו בהצלחה.');
    } catch (saveError) {
      console.error('Failed to save intake settings', saveError);
      setError('שמירת ההגדרות נכשלה. נסו שוב.');
      toast.error('שמירת ההגדרות נכשלה.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-0 bg-white/80 shadow-lg">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="text-lg font-semibold text-slate-900">הגדרות קליטת תלמידים</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6" dir="rtl">
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            מיפוי שדות טופס Microsoft Forms לשדות המערכת כדי לקלוט בקשות באמצעות Power Automate.
          </p>
          <p>
            שמרו את הסוד החיצוני והגדירו אותו בכותרת <span className="font-medium">x-intake-secret</span>.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {Object.keys(DEFAULT_MAPPING).map((fieldKey) => (
            <div key={fieldKey} className="space-y-2">
              <Label htmlFor={`intake-${fieldKey}`}>{FIELD_LABELS[fieldKey]}</Label>
              <Input
                id={`intake-${fieldKey}`}
                value={mapping[fieldKey]}
                onChange={handleFieldChange(fieldKey)}
                placeholder="לדוגמה: r459c"
                disabled={isLoading || isSaving}
              />
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="intake-secret">סוד חיצוני (External Intake Secret)</Label>
            <Input
              id="intake-secret"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="יצירת סוד חיצוני"
              disabled={isLoading || isSaving}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowSecret((prev) => !prev)}
              disabled={isLoading || isSaving}
            >
              {showSecret ? 'הסתרת סוד' : 'הצגת סוד'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleRegenerateSecret}
              disabled={isLoading || isSaving}
            >
              יצירת סוד חדש
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isLoading || isSaving || !hasChanges}
            className="min-w-[140px]"
          >
            {isSaving ? 'שומר...' : 'שמירת הגדרות'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
