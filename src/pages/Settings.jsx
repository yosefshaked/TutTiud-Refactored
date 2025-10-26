import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlugZap, Sparkles } from 'lucide-react';
import SetupAssistant from '@/components/settings/SetupAssistant.jsx';
import OrgMembersCard from '@/components/settings/OrgMembersCard.jsx';
import SessionFormManager from '@/components/settings/SessionFormManager.jsx';
import ServiceManager from '@/components/settings/ServiceManager.jsx';
import InstructorManager from '@/components/settings/InstructorManager.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import PageLayout from '@/components/ui/PageLayout.jsx';

export default function Settings() {
  const { activeOrg, activeOrgHasConnection, tenantClientReady, activeOrgId } = useOrg();
  const { authClient, user, loading, session } = useSupabase();
  const membershipRole = activeOrg?.membership?.role ?? null;
  const normalizedRole = typeof membershipRole === 'string' ? membershipRole.trim().toLowerCase() : '';
  const canManageSessionForm = normalizedRole === 'admin' || normalizedRole === 'owner';
  const setupDialogAutoOpenRef = useRef(!activeOrgHasConnection);
  const [isSetupDialogOpen, setIsSetupDialogOpen] = useState(!activeOrgHasConnection);

  useEffect(() => {
    if (activeOrgHasConnection) {
      setupDialogAutoOpenRef.current = false;
      setIsSetupDialogOpen(false);
      return;
    }
    if (!setupDialogAutoOpenRef.current) {
      setupDialogAutoOpenRef.current = true;
      setIsSetupDialogOpen(true);
    }
  }, [activeOrgHasConnection]);

  const handleSetupDialogChange = (open) => {
    setIsSetupDialogOpen(open);
    if (!open && !activeOrgHasConnection) {
      setupDialogAutoOpenRef.current = true;
    }
  };

  if (loading || !authClient) {
    return (
      <div className="p-6 text-center text-slate-500">
        טוען חיבור Supabase...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-slate-500">
        יש להתחבר כדי להגדיר את הארגון.
      </div>
    );
  }

  return (
    <PageLayout
      title="הגדרות הארגון"
      description="נטרו את מצב החיבור, הזמינו חברי צוות, ונטרו את טופס שאלות המפגש עבור הארגון הפעיל."
      contentClassName="space-y-md md:space-y-lg"
    >

        <Card className="w-full border-0 bg-white/90 shadow-lg" dir="rtl">
          <CardHeader className="border-b border-slate-200 space-y-xs">
            <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg md:text-xl">מידע לניפוי באגים</CardTitle>
            <p className="text-xs text-slate-600 sm:text-sm">
              שימוש בנתונים אלו מאפשר להבין איך האפליקציה מזהה את המשתמש הנוכחי וההרשאות שלו.
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-sm text-xs text-slate-700 sm:grid-cols-2 sm:gap-md sm:text-sm md:grid-cols-3">
              <div className="space-y-1">
                <dt className="font-medium text-slate-500">מזהה משתמש</dt>
                <dd className="break-all text-slate-900">{user?.id ?? '—'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium text-slate-500">אימייל</dt>
                <dd className="break-all text-slate-900">{user?.email ?? '—'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium text-slate-500">תפקיד מזוהה</dt>
                <dd className="text-slate-900">{membershipRole ? membershipRole : '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {canManageSessionForm ? (
          <>
            <div className="grid w-full gap-md lg:grid-cols-2" dir="rtl">
              <Card className="w-full border-0 bg-white/80 shadow-lg">
                <CardHeader className="border-b border-slate-200 space-y-xs">
                  <CardTitle className="flex flex-col gap-xs text-base font-semibold text-slate-900 sm:flex-row sm:items-center sm:justify-between sm:text-lg md:text-xl">
                    <span className="flex items-center gap-xs text-slate-900">
                      <PlugZap className="h-5 w-5 text-blue-600" aria-hidden="true" />
                      מצב חיבור Supabase
                    </span>
                    <Badge className={activeOrgHasConnection ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}>
                      {activeOrgHasConnection ? 'חיבור פעיל' : 'נדרש חיבור'}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-slate-600 sm:text-sm">
                    {activeOrgHasConnection
                      ? 'החיבור הנוכחי מאפשר קריאה וכתיבה להגדרות הארגון. ניתן לפתוח את האשף כדי לעדכן מפתחות או להריץ בדיקות חוזרות.'
                      : 'השלימו את אשף ההגדרה כדי לחבר את Supabase ולשמור את הגדרות טופס המפגש עבור הארגון.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-xs text-xs text-slate-500 sm:text-sm">
                    <span className="break-words">ארגון פעיל: {activeOrg ? activeOrg.name : 'לא נבחר ארגון'}</span>
                    {activeOrgHasConnection ? (
                      <div className="flex items-center gap-1 text-emerald-700">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        <span className="hidden sm:inline">האשף זמין לכל בדיקה חוזרת</span>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-end gap-xs pt-sm sm:gap-sm sm:pt-md">
                  <Button onClick={() => setIsSetupDialogOpen(true)} className="gap-xs text-sm" size="sm">
                    <PlugZap className="h-4 w-4" aria-hidden="true" />
                    {activeOrgHasConnection ? 'נהל חיבור Supabase' : 'התחל אשף הגדרה'}
                  </Button>
                </CardContent>
              </Card>

              <OrgMembersCard />
            </div>

            <SessionFormManager
              session={session}
              orgId={activeOrgId}
              activeOrgHasConnection={activeOrgHasConnection}
              tenantClientReady={tenantClientReady}
            />

            {canManageSessionForm && (
              <ServiceManager
                session={session}
                orgId={activeOrgId}
                activeOrgHasConnection={activeOrgHasConnection}
                tenantClientReady={tenantClientReady}
              />
            )}

            {canManageSessionForm && (
              <InstructorManager
                session={session}
                orgId={activeOrgId}
                activeOrgHasConnection={activeOrgHasConnection}
                tenantClientReady={tenantClientReady}
              />
            )}

            <Dialog open={isSetupDialogOpen} onOpenChange={handleSetupDialogChange}>
              <DialogContent
                wide
                className="w-[min(100vw-2rem,1080px)] max-w-5xl bg-transparent p-0 shadow-none"
              >
                <DialogHeader className="sr-only">
                  <DialogTitle>אשף הגדרת חיבור Supabase</DialogTitle>
                  <DialogDescription>
                    השלם את ההגדרות והבדיקות כדי לחבר את הארגון הפעיל ל-Supabase.
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[85vh] overflow-y-auto p-2 sm:p-4">
                  <SetupAssistant />
                </div>
              </DialogContent>
            </Dialog>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600" dir="rtl">
            אין לך הרשאות ניהול. פנה למנהל מערכת לקבלת גישה להגדרות הארגון.
          </div>
        )}
    </PageLayout>
  );
}
