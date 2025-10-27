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
        <div className="grid w-full gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3" dir="rtl">
          {/* Setup Assistant Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-gradient-to-br from-blue-50 to-white shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-blue-100 p-2 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                    <PlugZap className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle className="text-lg font-bold text-slate-900">
                    חיבור Supabase
                  </CardTitle>
                </div>
                <Badge className={activeOrgHasConnection ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-amber-100 text-amber-800 border-0'}>
                  {activeOrgHasConnection ? 'פעיל' : 'נדרש'}
                </Badge>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הגדרת מפתחות Supabase, בדיקת חיבור, והרצת סקריפט הגדרה אוטומטית
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                size="sm" 
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700" 
                onClick={() => { setSelectedModule('setup'); }}
              >
                <PlugZap className="h-4 w-4" /> פתח אשף הגדרה
              </Button>
            </CardContent>
          </Card>

          {/* Team Members Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-gradient-to-br from-purple-50 to-white shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-purple-100 p-2 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול חברי צוות
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הזמנת משתמשים חדשים, ניהול הרשאות, והסרת חברי צוות מהארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('orgMembers')} 
                disabled={!canManageSessionForm}
                variant={!canManageSessionForm ? 'secondary' : 'default'}
              >
                <Users className="h-4 w-4" /> נהל חברי צוות
              </Button>
            </CardContent>
          </Card>

          {/* Session Form Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-gradient-to-br from-emerald-50 to-white shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  טופס שאלות מפגש
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הגדרת שאלות מותאמות אישית לתיעוד מפגשים ומעקב אחר התקדמות תלמידים
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('sessionForm')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <ClipboardList className="h-4 w-4" /> נהל שאלות
              </Button>
            </CardContent>
          </Card>

          {/* Services Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-gradient-to-br from-orange-50 to-white shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-orange-100 p-2 text-orange-600 transition-colors group-hover:bg-orange-600 group-hover:text-white">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול שירותים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הוספת וניהול רשימת השירותים הזמינים למשתמשי הארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('services')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <ListChecks className="h-4 w-4" /> נהל שירותים
              </Button>
            </CardContent>
          </Card>

          {/* Instructors Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-gradient-to-br from-indigo-50 to-white shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול מדריכים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                הוספה, עריכה והשבתת מדריכים המשויכים לארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('instructors')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <Users className="h-4 w-4" /> נהל מדריכים
              </Button>
            </CardContent>
          </Card>

          {/* Backup & Restore Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-gradient-to-br from-slate-50 to-white shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02]">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-700 transition-colors group-hover:bg-slate-700 group-hover:text-white">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  גיבוי ושחזור
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                יצירת קובץ גיבוי מוצפן של נתוני הארגון ושחזור מגיבוי קיים
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('backup')} 
                disabled={!canManageSessionForm}
                variant={!canManageSessionForm ? 'secondary' : 'default'}
              >
                <ShieldCheck className="h-4 w-4" /> נהל גיבויים
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
