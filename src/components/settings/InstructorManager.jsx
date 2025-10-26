import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronDown, ChevronUp, Loader2, UserPlus, UserX, Save } from 'lucide-react';
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
  const [expanded, setExpanded] = useState({});
  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

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
      <Card className="w-full border-0 shadow-lg bg-white/80">
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
    <Card className="w-full border-0 shadow-lg bg-white/80">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">ניהול מדריכים</CardTitle>
        <p className="text-xs text-slate-600 mt-xs sm:mt-sm sm:text-sm">הוספה, השבתה והפעלה מחדש של מדריכים בארגון.</p>
      </CardHeader>
      <CardContent className="space-y-md sm:space-y-lg" dir="rtl">
        {isLoading ? (
          <div className="flex items-center justify-center py-md sm:py-lg">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="mr-2 text-xs text-slate-600 sm:text-sm">טוען נתונים...</span>
          </div>
        ) : loadError ? (
          <div className="rounded-md bg-red-50 p-sm text-xs text-red-700 sm:p-md sm:text-sm">{loadError}</div>
        ) : (
          <>
            <section className="space-y-sm sm:space-y-md">
              <h3 className="text-sm font-semibold text-slate-900 sm:text-base">מדריכים פעילים ({activeInstructors.length})</h3>
              {activeInstructors.length === 0 ? (
                <p className="text-xs text-slate-500 sm:text-sm">אין מדריכים פעילים.</p>
              ) : (
                <div className="space-y-xs max-h-72 overflow-y-auto sm:space-y-sm">
                  {activeInstructors.map((i) => (
                    <div key={i.id} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(i.id)}
                          className="flex min-w-0 items-center gap-2 rounded px-2 py-1 hover:bg-slate-50"
                          aria-expanded={Boolean(expanded[i.id])}
                          aria-controls={`inst-editor-${i.id}`}
                        >
                          <span className="truncate text-sm font-medium text-slate-900">{i.name || i.email || i.id}</span>
                          <span className="hidden text-xs text-slate-500 sm:inline">{i.email || '—'}</span>
                          {expanded[i.id] ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <div className="flex items-center gap-2">
                          <div className="hidden items-end gap-2 sm:flex">
                            <div className="text-xs text-slate-600">{i.phone || '—'}</div>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => handleDisable(i)} disabled={isSaving} className="text-xs">
                            <UserX className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">השבת</span>
                          </Button>
                        </div>
                      </div>
                      <div id={`inst-editor-${i.id}`} hidden={!expanded[i.id]} className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="w-full sm:min-w-[260px] sm:flex-1">
                            <Label htmlFor={`inst-name-${i.id}`} className="text-xs text-slate-600">שם</Label>
                            <Input
                              id={`inst-name-${i.id}`}
                              placeholder="שם המדריך"
                              className="h-10"
                              defaultValue={i.name || ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (i.name || '')) {
                                  handleSaveDetails(i, { name: val || null });
                                }
                              }}
                              disabled={isSaving}
                            />
                            <div className="mt-1 text-xs text-slate-500">{i.email || '—'}</div>
                          </div>
                          <div>
                            <Label htmlFor={`inst-phone-${i.id}`} className="text-xs text-slate-600">טלפון</Label>
                            <Input
                              id={`inst-phone-${i.id}`}
                              placeholder="טלפון"
                              className="h-10 w-32 sm:w-40"
                              defaultValue={i.phone || ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (i.phone || '')) {
                                  handleSaveDetails(i, { phone: val || null });
                                }
                              }}
                              disabled={isSaving}
                            />
                          </div>
                        </div>
                        <div>
                          <Label htmlFor={`inst-notes-${i.id}`} className="text-xs text-slate-600">הערות</Label>
                          <textarea
                            id={`inst-notes-${i.id}`}
                            className="mt-1 w-full resize-y rounded-md border p-2 text-sm"
                            rows={2}
                            defaultValue={i.notes || ''}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== (i.notes || '')) {
                                handleSaveDetails(i, { notes: val || null });
                              }
                            }}
                            disabled={isSaving}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-sm sm:space-y-md">
              <h3 className="text-sm font-semibold text-slate-900 sm:text-base">מדריכים מושבתים ({inactiveInstructors.length})</h3>
              {inactiveInstructors.length === 0 ? (
                <p className="text-xs text-slate-500 sm:text-sm">אין מדריכים מושבתים.</p>
              ) : (
                <div className="space-y-xs max-h-64 overflow-y-auto sm:space-y-sm">
                  {inactiveInstructors.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-sm rounded-md border p-sm">
                      <div className="text-xs text-slate-700 sm:text-sm">{i.name || i.email || i.id}</div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => handleEnable(i)} disabled={isSaving} className="text-xs">
                        <Save className="h-4 w-4" /> הפעל
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-sm sm:space-y-md">
              <h3 className="text-sm font-semibold text-slate-900 sm:text-base">חברי ארגון שאינם מדריכים ({nonInstructorMembers.length})</h3>
              {nonInstructorMembers.length === 0 ? (
                <p className="text-xs text-slate-500 sm:text-sm">כל החברים הם כבר מדריכים.</p>
              ) : (
                <div className="space-y-xs max-h-72 overflow-y-auto sm:space-y-sm">
                  {nonInstructorMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-sm rounded-md border p-sm">
                      <div className="w-full sm:min-w-[200px] sm:flex-1">
                        <div className="text-xs font-medium text-slate-900 sm:text-sm">{m?.profile?.full_name || m?.profile?.email || m.user_id}</div>
                        <div className="text-[10px] text-slate-500 sm:text-xs">{m?.profile?.email || '—'}</div>
                      </div>
                      <Button type="button" size="sm" className="gap-xs text-xs" onClick={() => handleAdd(m)} disabled={isSaving}>
                        <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" /> <span className="hidden sm:inline">הוסף</span>
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
