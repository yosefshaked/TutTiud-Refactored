import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UserPlus, UserX, Save } from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api-client';

const REQUEST = { idle: 'idle', loading: 'loading', error: 'error' };
const SAVE = { idle: 'idle', saving: 'saving', error: 'error' };

export default function InstructorManager({ session, orgId, activeOrgHasConnection, tenantClientReady }) {
  const canLoad = Boolean(session && orgId && activeOrgHasConnection && tenantClientReady);

  const [members, setMembers] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loadState, setLoadState] = useState(REQUEST.idle);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState(SAVE.idle);

  const instructorMap = useMemo(() => new Map(instructors.map((i) => [i.id, i])), [instructors]);

  const loadAll = useCallback(async () => {
    if (!canLoad) {
      setMembers([]);
      setInstructors([]);
      return;
    }
    setLoadState(REQUEST.loading);
    setLoadError('');
    try {
      const params = new URLSearchParams({ org_id: orgId });
      const dir = await authenticatedFetch(`directory?${params.toString()}`, { session });
      const roster = await authenticatedFetch(`instructors?${params.toString()}&include_inactive=true`, { session });
      setMembers(Array.isArray(dir?.members) ? dir.members : []);
      setInstructors(Array.isArray(roster) ? roster : []);
      setLoadState(REQUEST.idle);
    } catch (error) {
      console.error('Failed to load instructors/members', error);
      setLoadError(error?.message || 'טעינת המדריכים נכשלה.');
      setLoadState(REQUEST.error);
      setMembers([]);
      setInstructors([]);
    }
  }, [canLoad, orgId, session]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleAdd = async (user) => {
    if (!canLoad || !user?.user_id) return;
    setSaveState(SAVE.saving);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'POST',
        body: {
          org_id: orgId,
          user_id: user.user_id,
          name: user?.profile?.full_name || undefined,
          email: user?.profile?.email || undefined,
        },
      });
      toast.success('המדריך נוסף בהצלחה.');
      await loadAll();
    } catch (error) {
      console.error('Failed to add instructor', error);
      toast.error('הוספת המדריך נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const handleDisable = async (instructor) => {
    if (!canLoad || !instructor?.id) return;
    setSaveState(SAVE.saving);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'DELETE',
        body: { org_id: orgId, instructor_id: instructor.id },
      });
      toast.success('המדריך הושבת.');
      await loadAll();
    } catch (error) {
      console.error('Failed to disable instructor', error);
      toast.error('ההשבתה נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const handleEnable = async (instructor) => {
    if (!canLoad || !instructor?.id) return;
    setSaveState(SAVE.saving);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'PUT',
        body: { org_id: orgId, instructor_id: instructor.id, is_active: true },
      });
      toast.success('המדריך הופעל מחדש.');
      await loadAll();
    } catch (error) {
      console.error('Failed to enable instructor', error);
      toast.error('ההפעלה נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const handleSaveDetails = async (instructor, partial) => {
    if (!canLoad || !instructor?.id) return;
    setSaveState(SAVE.saving);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'PUT',
        body: { org_id: orgId, instructor_id: instructor.id, ...partial },
      });
      toast.success('פרטי המדריך נשמרו.');
      await loadAll();
    } catch (error) {
      console.error('Failed to update instructor', error);
      toast.error('שמירת פרטי המדריך נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  if (!activeOrgHasConnection || !tenantClientReady) {
    return (
      <Card className="border-0 shadow-lg bg-white/80">
        <CardHeader>
          <CardTitle>ניהול מדריכים</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">נדרש חיבור Supabase פעיל כדי לנהל מדריכים.</p>
        </CardContent>
      </Card>
    );
  }

  const isLoading = loadState === REQUEST.loading;
  const isSaving = saveState === SAVE.saving;

  const activeInstructors = instructors.filter((i) => i.is_active);
  const inactiveInstructors = instructors.filter((i) => !i.is_active);
  const nonInstructorMembers = members.filter((m) => !instructorMap.has(m.user_id));

  return (
    <Card className="border-0 shadow-lg bg-white/80">
      <CardHeader>
        <CardTitle>ניהול מדריכים</CardTitle>
        <p className="text-sm text-slate-600 mt-2">הוספה, השבתה והפעלה מחדש של מדריכים בארגון.</p>
      </CardHeader>
      <CardContent className="space-y-6" dir="rtl">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="mr-2 text-sm text-slate-600">טוען נתונים...</span>
          </div>
        ) : loadError ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
        ) : (
          <>
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">מדריכים פעילים ({activeInstructors.length})</h3>
              {activeInstructors.length === 0 ? (
                <p className="text-sm text-slate-500">אין מדריכים פעילים.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {activeInstructors.map((i) => (
                    <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                      <div className="min-w-[200px]">
                        <div className="text-sm font-medium text-slate-900">{i.name || i.email || i.id}</div>
                        <div className="text-xs text-slate-500">{i.email || '—'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="טלפון"
                          className="h-8 w-40"
                          defaultValue={i.phone || ''}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val !== (i.phone || '')) {
                              handleSaveDetails(i, { phone: val });
                            }
                          }}
                          disabled={isSaving}
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => handleDisable(i)} disabled={isSaving}>
                          <UserX className="h-4 w-4" /> השבת
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">מדריכים מושבתים ({inactiveInstructors.length})</h3>
              {inactiveInstructors.length === 0 ? (
                <p className="text-sm text-slate-500">אין מדריכים מושבתים.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {inactiveInstructors.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div className="text-sm text-slate-700">{i.name || i.email || i.id}</div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => handleEnable(i)} disabled={isSaving}>
                        <Save className="h-4 w-4" /> הפעל
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">חברי ארגון שאינם מדריכים ({nonInstructorMembers.length})</h3>
              {nonInstructorMembers.length === 0 ? (
                <p className="text-sm text-slate-500">כל החברים הם כבר מדריכים.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {nonInstructorMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <div className="min-w-[200px]">
                        <div className="text-sm font-medium text-slate-900">{m?.profile?.full_name || m?.profile?.email || m.user_id}</div>
                        <div className="text-xs text-slate-500">{m?.profile?.email || '—'}</div>
                      </div>
                      <Button type="button" size="sm" className="gap-1" onClick={() => handleAdd(m)} disabled={isSaving}>
                        <UserPlus className="h-4 w-4" /> הוסף כמדריך
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
