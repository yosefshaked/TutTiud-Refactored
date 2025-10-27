import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PlugZap, Sparkles, Users, ListChecks, ClipboardList, ShieldCheck } from 'lucide-react';
import SetupAssistant from '@/components/settings/SetupAssistant.jsx';
import OrgMembersCard from '@/components/settings/OrgMembersCard.jsx';
import SessionFormManager from '@/components/settings/SessionFormManager.jsx';
import ServiceManager from '@/components/settings/ServiceManager.jsx';
import InstructorManager from '@/components/settings/InstructorManager.jsx';
import BackupManager from '@/components/settings/BackupManager.jsx';
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
  const [selectedModule, setSelectedModule] = useState(null); // 'setup' | 'orgMembers' | 'sessionForm' | 'services' | 'instructors' | 'backup'

  useEffect(() => {
    if (activeOrgHasConnection) {
      setupDialogAutoOpenRef.current = false;
  // close any open module dialog
  setSelectedModule(null);
      return;
    }
    if (!setupDialogAutoOpenRef.current) {
      setupDialogAutoOpenRef.current = true;
      setSelectedModule('setup');
    }
  }, [activeOrgHasConnection]);

  const handleModuleDialogChange = (open) => {
    if (!open) {
      setSelectedModule(null);
      if (!activeOrgHasConnection) {
        setupDialogAutoOpenRef.current = true;
      }
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

        {/* Selector grid */}
        <div className="grid w-full gap-md md:grid-cols-2 lg:grid-cols-3" dir="rtl">
          <Card className="w-full border-0 bg-white/80 shadow-lg">
            <CardHeader className="border-b border-slate-200 space-y-xs">
              <CardTitle className="flex items-center justify-between gap-xs text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
                <span className="flex items-center gap-xs text-slate-900">
                  <PlugZap className="h-5 w-5 text-blue-600" aria-hidden="true" />
                  מצב חיבור Supabase
                </span>
                <Badge className={activeOrgHasConnection ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}>
                  {activeOrgHasConnection ? 'חיבור פעיל' : 'נדרש חיבור'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end pt-sm">
              <Button size="sm" className="gap-xs" onClick={() => { setSelectedModule('setup'); }}>
                <PlugZap className="h-4 w-4" /> פתח/י אשף
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full border-0 bg-white/80 shadow-lg">
            <CardHeader className="border-b border-slate-200 space-y-xs">
              <CardTitle className="flex items-center gap-xs text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
                <Users className="h-5 w-5 text-slate-700" /> ניהול חברי צוות
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end pt-sm">
              <Button size="sm" className="gap-xs" onClick={() => setSelectedModule('orgMembers')} disabled={!canManageSessionForm}>
                פתח/י
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full border-0 bg-white/80 shadow-lg">
            <CardHeader className="border-b border-slate-200 space-y-xs">
              <CardTitle className="flex items-center gap-xs text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
                <ClipboardList className="h-5 w-5 text-slate-700" /> טופס שאלות מפגש
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end pt-sm">
              <Button size="sm" className="gap-xs" onClick={() => setSelectedModule('sessionForm')} disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}>
                פתח/י
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full border-0 bg-white/80 shadow-lg">
            <CardHeader className="border-b border-slate-200 space-y-xs">
              <CardTitle className="flex items-center gap-xs text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
                <ListChecks className="h-5 w-5 text-slate-700" /> ניהול שירותים
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end pt-sm">
              <Button size="sm" className="gap-xs" onClick={() => setSelectedModule('services')} disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}>
                פתח/י
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full border-0 bg-white/80 shadow-lg">
            <CardHeader className="border-b border-slate-200 space-y-xs">
              <CardTitle className="flex items-center gap-xs text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
                <Users className="h-5 w-5 text-slate-700" /> ניהול מדריכים
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end pt-sm">
              <Button size="sm" className="gap-xs" onClick={() => setSelectedModule('instructors')} disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}>
                פתח/י
              </Button>
            </CardContent>
          </Card>

          <Card className="w-full border-0 bg-white/80 shadow-lg">
            <CardHeader className="border-b border-slate-200 space-y-xs">
              <CardTitle className="flex items-center gap-xs text-base font-semibold text-slate-900 sm:text-lg md:text-xl">
                <ShieldCheck className="h-5 w-5 text-slate-700" /> גיבוי ושחזור
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-end pt-sm">
              <Button size="sm" className="gap-xs" onClick={() => setSelectedModule('backup')} disabled={!canManageSessionForm}>
                פתח/י
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Floating dialog for the selected module */}
        <Dialog open={Boolean(selectedModule)} onOpenChange={handleModuleDialogChange}>
          <DialogContent
            wide
            className="w-[min(100vw-2rem,1080px)] max-w-5xl bg-transparent p-0 shadow-none"
          >
            <DialogHeader className="sr-only">
              <DialogTitle>ניהול הגדרות</DialogTitle>
              <DialogDescription>בחר/י והגדיר/י את ההגדרה הרצויה</DialogDescription>
            </DialogHeader>
            <div className="max-h-[85vh] overflow-y-auto p-2 sm:p-4">
              {selectedModule === 'setup' && (
                <SetupAssistant />
              )}
              {selectedModule === 'orgMembers' && (
                <OrgMembersCard />
              )}
              {selectedModule === 'sessionForm' && (
                <SessionFormManager
                  session={session}
                  orgId={activeOrgId}
                  activeOrgHasConnection={activeOrgHasConnection}
                  tenantClientReady={tenantClientReady}
                />
              )}
              {selectedModule === 'services' && (
                <ServiceManager
                  session={session}
                  orgId={activeOrgId}
                  activeOrgHasConnection={activeOrgHasConnection}
                  tenantClientReady={tenantClientReady}
                />
              )}
              {selectedModule === 'instructors' && (
                <InstructorManager
                  session={session}
                  orgId={activeOrgId}
                  activeOrgHasConnection={activeOrgHasConnection}
                  tenantClientReady={tenantClientReady}
                />
              )}
              {selectedModule === 'backup' && (
                <BackupManager session={session} orgId={activeOrgId} />
              )}
            </div>
          </DialogContent>
        </Dialog>
    </PageLayout>
  );
}
