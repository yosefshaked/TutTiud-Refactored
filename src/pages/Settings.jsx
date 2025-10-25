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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-2 text-right">
          <h1 className="text-3xl font-bold text-slate-900">הגדרות הארגון</h1>
          <p className="text-slate-600">
            נטרו את מצב החיבור, הזמינו חברי צוות, ונטרו את טופס שאלות המפגש עבור הארגון הפעיל.
          </p>
        </header>

        <Card className="border-0 bg-white/90 shadow-lg" dir="rtl">
          <CardHeader className="border-b border-slate-200 space-y-2">
            <CardTitle className="text-xl font-semibold text-slate-900">מידע לניפוי באגים</CardTitle>
            <p className="text-sm text-slate-600">
              שימוש בנתונים אלו מאפשר להבין איך האפליקציה מזהה את המשתמש הנוכחי וההרשאות שלו.
            </p>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm text-slate-700 sm:grid-cols-3">
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
            <div className="grid gap-6 xl:grid-cols-[1.5fr,1fr]" dir="rtl">
              <Card className="border-0 bg-white/80 shadow-lg">
                <CardHeader className="border-b border-slate-200 space-y-3">
                  <CardTitle className="flex flex-col gap-2 text-xl font-semibold text-slate-900 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2 text-slate-900">
                      <PlugZap className="h-5 w-5 text-blue-600" aria-hidden="true" />
                      מצב חיבור Supabase
                    </span>
                    <Badge className={activeOrgHasConnection ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}>
                      {activeOrgHasConnection ? 'חיבור פעיל' : 'נדרש חיבור'}
                    </Badge>
                  </CardTitle>
                  <p className="text-sm text-slate-600">
                    {activeOrgHasConnection
                      ? 'החיבור הנוכחי מאפשר קריאה וכתיבה להגדרות הארגון. ניתן לפתוח את האשף כדי לעדכן מפתחות או להריץ בדיקות חוזרות.'
                      : 'השלימו את אשף ההגדרה כדי לחבר את Supabase ולשמור את הגדרות טופס המפגש עבור הארגון.'}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                    <span>ארגון פעיל: {activeOrg ? activeOrg.name : 'לא נבחר ארגון'}</span>
                    {activeOrgHasConnection ? (
                      <div className="flex items-center gap-1 text-emerald-700">
                        <Sparkles className="h-4 w-4" aria-hidden="true" />
                        <span>האשף זמין לכל בדיקה חוזרת</span>
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-end gap-3 pt-6">
                  <Button onClick={() => setIsSetupDialogOpen(true)} className="gap-2">
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
      </div>
    </div>
  );
}
