import React, { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar.jsx';
import {
  Check,
  ChevronDown,
  Loader2,
  MailPlus,
  RotateCcw,
  UserPlus,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api-client';
import { useInstructorTypes } from '@/features/instructors/hooks/useInstructorTypes.js';
import InfoTooltip from '@/components/ui/InfoTooltip.jsx';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useInstructors } from '@/hooks/useOrgData.js';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

const REQUEST = { idle: 'idle', loading: 'loading', error: 'error' };
const SAVE = { idle: 'idle', saving: 'saving', error: 'error' };

export default function DirectoryView({ session, orgId, canLoad }) {
  const [members, setMembers] = useState([]);
  const [loadState, setLoadState] = useState(REQUEST.idle);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState(SAVE.idle);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPlaceholder, setCreatePlaceholder] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activatingId, setActivatingId] = useState(null);

  const { typeOptions, loadTypes } = useInstructorTypes();
  const { instructors, loadingInstructors, instructorsError, refetchInstructors } = useInstructors({
    includeInactive: true,
    orgId,
    session,
    enabled: canLoad,
  });

  const loadDirectory = useCallback(async () => {
    if (!canLoad) {
      setMembers([]);
      return;
    }
    setLoadState(REQUEST.loading);
    setLoadError('');
    try {
      const params = new URLSearchParams({ org_id: orgId });
      const dir = await authenticatedFetch(`directory?${params.toString()}`, { session });
      setMembers(Array.isArray(dir?.members) ? dir.members : []);
      setLoadState(REQUEST.idle);
    } catch (error) {
      console.error('Failed to load instructors/members', error);
      setLoadError(error?.message || 'טעינת המדריכים נכשלה.');
      setLoadState(REQUEST.error);
      setMembers([]);
    }
  }, [canLoad, orgId, session]);

  useEffect(() => {
    if (canLoad) {
      loadTypes();
      void refetchInstructors();
      void loadDirectory();
    } else {
      setMembers([]);
    }
  }, [canLoad, loadTypes, loadDirectory, refetchInstructors]);

  const handlePromoteToInstructor = async (user) => {
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
      await Promise.all([refetchInstructors(), loadDirectory()]);
    } catch (error) {
      console.error('Failed to add instructor', error);
      toast.error('הוספת המדריך נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const handleCreateInstructor = async (event) => {
    event.preventDefault();
    if (!canLoad) return;
    setIsCreating(true);
    setCreateError('');
    try {
      const payload = {
        org_id: orgId,
        name: createName.trim() || undefined,
        email: createEmail.trim(),
        create_placeholder: createPlaceholder,
      };
      await authenticatedFetch('instructors', {
        session,
        method: 'POST',
        body: payload,
      });

      toast.success(createPlaceholder
        ? 'המדריך נוצר כמחזיק מקום. ניתן לשלוח הפעלה בהמשך.'
        : 'המדריך נוצר ונשלח אליו קישור הפעלה.');

      setCreateName('');
      setCreateEmail('');
      setCreatePlaceholder(false);
      setIsCreateOpen(false);
      await Promise.all([refetchInstructors(), loadDirectory()]);
    } catch (error) {
      console.error('Failed to create instructor', error);
      const message = error?.data?.message;
      if (message === 'missing_email') {
        setCreateError('חובה להזין כתובת אימייל תקינה.');
      } else if (message === 'invalid_email') {
        setCreateError('כתובת האימייל אינה תקינה.');
      } else if (message === 'failed_to_send_activation') {
        setCreateError('המדריך נוצר אך שליחת ההפעלה נכשלה. נסה שוב.');
      } else {
        setCreateError('יצירת המדריך נכשלה. נסה שוב.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendActivation = async (instructor) => {
    if (!canLoad || !instructor?.email) {
      toast.error('חסרה כתובת אימייל להפעלה.');
      return;
    }
    setActivatingId(instructor.id);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'POST',
        body: {
          org_id: orgId,
          action: 'send_activation',
          email: instructor.email,
        },
      });
      toast.success('קישור הפעלה נשלח למדריך.');
    } catch (error) {
      console.error('Failed to send activation email', error);
      toast.error('שליחת ההפעלה נכשלה. נסה שוב.');
    } finally {
      setActivatingId(null);
    }
  };

  const handleDeactivate = async (instructor) => {
    if (!canLoad || !instructor?.id) return;
    setSaveState(SAVE.saving);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'DELETE',
        body: { org_id: orgId, instructor_id: instructor.id },
      });
      toast.success('המדריך הושבת.');
      await Promise.all([refetchInstructors(), loadDirectory()]);
    } catch (error) {
      console.error('Failed to disable instructor', error);
      toast.error('ההשבתה נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const handleReactivate = async (instructor) => {
    if (!canLoad || !instructor?.id) return;
    setSaveState(SAVE.saving);
    try {
      await authenticatedFetch('instructors', {
        session,
        method: 'PUT',
        body: { org_id: orgId, instructor_id: instructor.id, is_active: true },
      });
      toast.success('המדריך הופעל מחדש.');
      await Promise.all([refetchInstructors(), loadDirectory()]);
    } catch (error) {
      console.error('Failed to enable instructor', error);
      toast.error('ההפעלה נכשלה.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const handleChangeType = async (instructor, newTypes) => {
    if (!canLoad || !instructor?.id) return;
    const currentTypes = Array.isArray(instructor.instructor_types) ? instructor.instructor_types : [];
    
    // Check if arrays are equal
    const isSame = currentTypes.length === newTypes.length && 
      currentTypes.every(t => newTypes.includes(t)) && 
      newTypes.every(t => currentTypes.includes(t));
    
    if (isSame) return;

    setSaveState(SAVE.saving);
    try {
      const typesToSave = newTypes.length > 0 ? newTypes : null;
      await authenticatedFetch('instructors', {
        session,
        method: 'PUT',
        body: { org_id: orgId, instructor_id: instructor.id, instructor_types: typesToSave },
      });
      toast.success('סוגי המדריך עודכנו.');
      await Promise.all([refetchInstructors(), loadDirectory()]);
    } catch (error) {
      console.error('Failed to update instructor types', error);
      toast.error('עדכון סוגי המדריך נכשל.');
    } finally {
      setSaveState(SAVE.idle);
    }
  };

  const isLoading = loadState === REQUEST.loading || loadingInstructors;
  const isSaving = saveState === SAVE.saving;

  const activeInstructors = instructors.filter((i) => i.is_active);
  const inactiveInstructors = instructors.filter((i) => !i.is_active);
  const instructorMap = new Map(instructors.map((i) => [i.id, i]));
  const nonInstructorMembers = members.filter((m) => !instructorMap.has(m.user_id));

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-sm text-slate-600">טוען נתונים...</span>
      </div>
    );
  }

  if (loadError || instructorsError) {
    return (
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
        {loadError || instructorsError}
      </div>
    );
  }

  return (
    <Tabs defaultValue="active" className="w-full" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">ניהול מדריכים</h3>
          <p className="text-xs text-muted-foreground">
            צור מדריך חדש או הגדר מדריך כמחזיק מקום להפעלה מאוחרת.
          </p>
        </div>
        <Dialog
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) {
              setCreateError('');
            }
          }}
        >
          <Button type="button" className="gap-2" onClick={() => setIsCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            הוסף מדריך
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>הוספת מדריך חדש</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={handleCreateInstructor}>
              <div className="space-y-2">
                <label htmlFor="instructor-name" className="block text-sm font-medium text-slate-700">
                  שם מלא
                </label>
                <Input
                  id="instructor-name"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="שם המדריך"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="instructor-email" className="block text-sm font-medium text-slate-700">
                  כתובת אימייל
                </label>
                <Input
                  id="instructor-email"
                  type="email"
                  dir="ltr"
                  required
                  value={createEmail}
                  onChange={(event) => setCreateEmail(event.target.value)}
                  placeholder="instructor@example.com"
                />
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="instructor-placeholder"
                    checked={createPlaceholder}
                    onCheckedChange={(value) => setCreatePlaceholder(Boolean(value))}
                  />
                  <div className="space-y-1">
                    <label htmlFor="instructor-placeholder" className="text-sm font-medium text-slate-700">
                      צור כמחזיק מקום (שלח הפעלה מאוחר יותר)
                    </label>
                    <p className="text-xs text-muted-foreground">
                      כאשר האפשרות פעילה לא נשלח מייל. ניתן לשלוח קישור הפעלה ידנית מהרשימה.
                    </p>
                  </div>
                </div>
              </div>
              {createError ? (
                <p className="text-sm text-red-600" role="alert">{createError}</p>
              ) : null}
              <DialogFooter>
                <Button
                  type="submit"
                  className="gap-2"
                  disabled={isCreating}
                >
                  {isCreating ? 'יוצר...' : 'צור מדריך'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={isCreating}
                >
                  ביטול
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <TabsList className="grid w-full grid-cols-3 mb-4 h-auto">
        <TabsTrigger value="active" className="flex-col gap-1 py-2 whitespace-normal break-words">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs sm:text-sm text-center">מדריכים פעילים</span>
            <Badge variant="secondary" className="text-xs sm:mr-2">{activeInstructors.length}</Badge>
          </div>
        </TabsTrigger>
        <TabsTrigger value="inactive" className="flex-col gap-1 py-2 whitespace-normal break-words">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs sm:text-sm text-center">מדריכים מושבתים</span>
            <Badge variant="secondary" className="text-xs sm:mr-2">{inactiveInstructors.length}</Badge>
          </div>
        </TabsTrigger>
        <TabsTrigger value="members" className="flex-col gap-1 py-2 whitespace-normal break-words">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs sm:text-sm text-center">חברי ארגון</span>
            <Badge variant="secondary" className="text-xs sm:mr-2">{nonInstructorMembers.length}</Badge>
          </div>
        </TabsTrigger>
      </TabsList>

      {/* Active Instructors Tab */}
      <TabsContent value="active" className="space-y-2">
        {activeInstructors.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">אין מדריכים פעילים.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto overflow-x-visible">
            {activeInstructors.map((instructor) => (
              <div
                key={instructor.id}
                className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg bg-white hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-blue-100 text-blue-700">
                      {getInitials(instructor.name || instructor.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-medium text-sm truncate">
                      {instructor.name || instructor.email || instructor.id}
                      {instructor?.metadata?.placeholder ? (
                        <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">
                          לא הופעל
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {instructor.email || '—'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <div className="flex flex-row-reverse sm:flex-row items-center gap-1 w-full sm:w-auto">
                    <InfoTooltip 
                      message="להגדרת סוגי מדריכים: הגדרות ← ניהול תגיות וסיווגים"
                      side="top"
                    />
                    <div className="flex-1 sm:min-w-60">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between h-auto min-h-10 py-2"
                            disabled={isSaving || typeOptions.length === 0}
                          >
                            <div className="flex flex-wrap gap-1 flex-1">
                              {Array.isArray(instructor.instructor_types) && instructor.instructor_types.length > 0 ? (
                                instructor.instructor_types.map(typeId => {
                                  const type = typeOptions.find(t => t.value === typeId);
                                  return type ? (
                                    <Badge key={typeId} variant="secondary" className="text-xs">
                                      {type.label}
                                    </Badge>
                                  ) : null;
                                })
                              ) : (
                                <span className="text-muted-foreground text-sm">בחר סוגי מדריך...</span>
                              )}
                            </div>
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-0" align="start">
                          <div className="max-h-64 overflow-y-auto p-1">
                            {typeOptions.length === 0 ? (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                אין סוגי מדריכים זמינים
                              </div>
                            ) : (
                              typeOptions.map((option) => {
                                const isSelected = Array.isArray(instructor.instructor_types) && 
                                  instructor.instructor_types.includes(option.value);
                                return (
                                  <div
                                    key={option.value}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-sm hover:bg-accent",
                                      isSelected && "bg-accent"
                                    )}
                                    onClick={() => {
                                      const currentTypes = Array.isArray(instructor.instructor_types) 
                                        ? instructor.instructor_types 
                                        : [];
                                      const newTypes = isSelected
                                        ? currentTypes.filter(t => t !== option.value)
                                        : [...currentTypes, option.value];
                                      handleChangeType(instructor, newTypes);
                                    }}
                                  >
                                    <div className={cn(
                                      "flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                      isSelected ? "bg-primary text-primary-foreground" : "opacity-50"
                                    )}>
                                      {isSelected && <Check className="h-3 w-3" />}
                                    </div>
                                    <span>{option.label}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeactivate(instructor)}
                    disabled={isSaving}
                    className="gap-2 h-10 w-full sm:w-auto"
                  >
                    <UserX className="h-4 w-4" />
                    <span>השבת</span>
                  </Button>
                  {instructor?.metadata?.placeholder ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSendActivation(instructor)}
                      disabled={isSaving || activatingId === instructor.id}
                      className="gap-2 h-10 w-full sm:w-auto"
                    >
                      <MailPlus className="h-4 w-4" />
                      <span>{activatingId === instructor.id ? 'שולח...' : 'שלח הפעלה'}</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Inactive Instructors Tab */}
      <TabsContent value="inactive" className="space-y-2">
        {inactiveInstructors.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">אין מדריכים מושבתים.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {inactiveInstructors.map((instructor) => (
              <div
                key={instructor.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg bg-slate-50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-slate-200 text-slate-600">
                      {getInitials(instructor.name || instructor.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-500 truncate">
                      {instructor.name || instructor.email || instructor.id}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {instructor.email || '—'}
                    </div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleReactivate(instructor)}
                  disabled={isSaving}
                  className="gap-2 h-10 w-full sm:w-auto"
                >
                  <RotateCcw className="h-4 w-4" />
                  הפעל מחדש
                </Button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      {/* Non-Instructor Members Tab */}
      <TabsContent value="members" className="space-y-2">
        {nonInstructorMembers.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            כל חברי הארגון הם כבר מדריכים.
          </p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {nonInstructorMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg bg-white hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-green-100 text-green-700">
                      {getInitials(member?.profile?.full_name || member?.profile?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {member?.profile?.full_name || member?.profile?.email || member.user_id}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {member?.profile?.email || '—'}
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => handlePromoteToInstructor(member)}
                  disabled={isSaving}
                  className="gap-2 h-10 w-full sm:w-auto"
                >
                  <UserPlus className="h-4 w-4" />
                  הפוך למדריך
                </Button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
