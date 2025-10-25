import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { upsertSetting } from '@/api/settings';
import { authenticatedFetch } from '@/lib/api-client';

const REQUEST_STATE = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

const SAVE_STATE = {
  idle: 'idle',
  saving: 'saving',
  error: 'error',
};

export default function ServiceManager({ session, orgId, activeOrgHasConnection, tenantClientReady }) {
  const [services, setServices] = useState([]);
  const [newService, setNewService] = useState('');
  const [loadState, setLoadState] = useState(REQUEST_STATE.idle);
  const [saveState, setSaveState] = useState(SAVE_STATE.idle);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');

  const canLoad = Boolean(session && orgId && activeOrgHasConnection && tenantClientReady);

  const loadServices = useCallback(async () => {
    if (!canLoad) {
      setServices([]);
      return;
    }

    setLoadState(REQUEST_STATE.loading);
    setLoadError('');

    try {
      const searchParams = new URLSearchParams({ keys: 'available_services', org_id: orgId });
      const payload = await authenticatedFetch(`settings?${searchParams.toString()}`, { session });
      const settingsValue = payload?.settings?.available_services;

      if (Array.isArray(settingsValue)) {
        setServices(settingsValue);
      } else {
        setServices([]);
      }

      setLoadState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Failed to load services', error);
      setServices([]);
      setLoadState(REQUEST_STATE.error);
      setLoadError(error?.message || 'טעינת השירותים נכשלה.');
    }
  }, [canLoad, session, orgId]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const handleAddService = () => {
    const trimmed = newService.trim();
    if (!trimmed) {
      toast.error('יש להזין שם שירות.');
      return;
    }

    if (services.includes(trimmed)) {
      toast.error('שירות זה כבר קיים ברשימה.');
      return;
    }

    setServices([...services, trimmed]);
    setNewService('');
  };

  const handleRemoveService = (index) => {
    setServices(services.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!canLoad) {
      return;
    }

    setSaveState(SAVE_STATE.saving);
    setSaveError('');

    try {
      await upsertSetting({
        session,
        orgId,
        key: 'available_services',
        value: services,
      });
      setSaveState(SAVE_STATE.idle);
      toast.success('השירותים נשמרו בהצלחה.');
    } catch (error) {
      console.error('Failed to save services', error);
      setSaveError(error?.message || 'שמירת השירותים נכשלה.');
      setSaveState(SAVE_STATE.error);
      toast.error('שמירת השירותים נכשלה.');
    }
  };

  if (!activeOrgHasConnection || !tenantClientReady) {
    return (
      <Card className="border-0 shadow-lg bg-white/80">
        <CardHeader>
          <CardTitle>ניהול שירותים</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            נדרש חיבור Supabase פעיל כדי לנהל שירותים.
          </p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = loadState === REQUEST_STATE.loading;
  const isSaving = saveState === SAVE_STATE.saving;

  return (
    <Card className="border-0 shadow-lg bg-white/80">
      <CardHeader>
        <CardTitle>ניהול שירותים</CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          הגדר את רשימת השירותים הזמינים בארגון. השירותים יופיעו בטופס הוספת תלמיד.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="mr-2 text-sm text-slate-600">טוען שירותים...</span>
          </div>
        ) : loadError ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="new-service">הוסף שירות חדש</Label>
              <div className="flex gap-2">
                <Input
                  id="new-service"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  placeholder="לדוגמה: פיזיותרפיה"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddService();
                    }
                  }}
                  disabled={isSaving}
                />
                <Button
                  type="button"
                  onClick={handleAddService}
                  disabled={isSaving}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  הוסף
                </Button>
              </div>
            </div>

            {services.length > 0 ? (
              <div className="space-y-2">
                <Label>שירותים זמינים ({services.length})</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
                  {services.map((service, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-md"
                    >
                      <span className="text-sm">{service}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveService(index)}
                        disabled={isSaving}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500 text-center py-4">
                אין שירותים מוגדרים. הוסף שירות ראשון.
              </p>
            )}

            {saveError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {saveError}
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || services.length === 0}
                className="gap-2"
              >
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                שמור שירותים
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
