import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDialogHeader } from '@/components/ui/DialogHeader';
import { PlugZap, Sparkles, Users, ListChecks, ClipboardList, ShieldCheck, Tag } from 'lucide-react';
import SetupAssistant from '@/components/settings/SetupAssistant.jsx';
import OrgMembersCard from '@/components/settings/OrgMembersCard.jsx';
import SessionFormManager from '@/components/settings/SessionFormManager.jsx';
import ServiceManager from '@/components/settings/ServiceManager.jsx';
import InstructorManager from '@/components/settings/InstructorManager.jsx';
import BackupManager from '@/components/settings/BackupManager.jsx';
import LogoManager from '@/components/settings/LogoManager.jsx';
import TagsManager from '@/components/settings/TagsManager.jsx';
import { OnboardingCard } from '@/features/onboarding/components/OnboardingCard.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import PageLayout from '@/components/ui/PageLayout.jsx';

export default function Settings() {
  const { activeOrg, activeOrgHasConnection, tenantClientReady, activeOrgId, enableDirectory, disableDirectory } = useOrg();
  const { authClient, user, loading, session } = useSupabase();
  const membershipRole = activeOrg?.membership?.role ?? null;
  const normalizedRole = typeof membershipRole === 'string' ? membershipRole.trim().toLowerCase() : '';
  const canManageSessionForm = normalizedRole === 'admin' || normalizedRole === 'owner';
  const setupDialogAutoOpenRef = useRef(!activeOrgHasConnection);
  const [selectedModule, setSelectedModule] = useState(null); // 'setup' | 'orgMembers' | 'sessionForm' | 'services' | 'instructors' | 'backup' | 'logo' | 'tags'
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [logoEnabled, setLogoEnabled] = useState(false);

  // Fetch backup permissions and initialize if empty
  useEffect(() => {
    if (!activeOrgId || !authClient) return;
    
    const fetchAndInitializePermissions = async () => {
      try {
        // First, get current permissions
        const { data: orgSettings, error: fetchError } = await authClient
          .from('org_settings')
          .select('permissions')
          .eq('org_id', activeOrgId)
          .single();
        
        if (fetchError) {
          console.error('Error fetching permissions:', fetchError);
          setBackupEnabled(false);
          return;
        }
        
        let permissions = orgSettings?.permissions;
        
        // Check if permissions is null, empty object, or has no keys
        const needsInitialization = !permissions || 
          typeof permissions !== 'object' || 
          Object.keys(permissions).length === 0;
        
        if (needsInitialization) {
          console.log('Permissions empty/null, initializing with defaults from registry');
          
          // Get default permissions from the registry
          const { data: defaults, error: defaultsError } = await authClient
            .rpc('get_default_permissions');
          
          if (defaultsError) {
            console.error('Error fetching default permissions:', defaultsError);
            setBackupEnabled(false);
            return;
          }
          
          // Update org_settings with default permissions
          const { error: updateError } = await authClient
            .from('org_settings')
            .update({ permissions: defaults })
            .eq('org_id', activeOrgId);
          
          if (updateError) {
            console.error('Error initializing permissions:', updateError);
            setBackupEnabled(false);
            return;
          }
          
          console.log('Permissions initialized successfully');
          permissions = defaults;
        }
        
        setBackupEnabled(permissions?.backup_local_enabled === true);
        setLogoEnabled(permissions?.logo_enabled === true);
      } catch (err) {
        console.error('Error in permissions initialization:', err);
        setBackupEnabled(false);
        setLogoEnabled(false);
      }
    };
    
    fetchAndInitializePermissions();
  }, [activeOrgId, authClient]);

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

  // Wake control DB directory fetch only while Team Members dialog is open
  useEffect(() => {
    if (selectedModule === 'orgMembers') {
      enableDirectory?.();
    } else {
      disableDirectory?.();
    }
    return () => {
      disableDirectory?.();
    };
  }, [selectedModule, enableDirectory, disableDirectory]);

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

        {/* Onboarding Tour Card - Available to all users */}
        <div className="w-full" dir="rtl">
          <OnboardingCard />
        </div>

        {/* Selector grid - only visible to admin/owner */}
        {canManageSessionForm && (
        <div className="grid w-full gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3" dir="rtl">
          {/* Setup Assistant Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
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
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הגדרת מפתחות Supabase, בדיקת חיבור, והרצת סקריפט הגדרה אוטומטית
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700" 
                onClick={() => { setSelectedModule('setup'); }}
              >
                <PlugZap className="h-4 w-4" /> פתיחת אשף הגדרה
              </Button>
            </CardContent>
          </Card>

          {/* Team Members Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-purple-100 p-2 text-purple-600 transition-colors group-hover:bg-purple-600 group-hover:text-white">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול חברי צוות
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הזמנת משתמשים חדשים, ניהול הרשאות, והסרת חברי צוות מהארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('orgMembers')} 
                disabled={!canManageSessionForm}
                variant={!canManageSessionForm ? 'secondary' : 'default'}
              >
                <Users className="h-4 w-4" /> ניהול חברי צוות
              </Button>
            </CardContent>
          </Card>

          {/* Session Form Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-600 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                  <ClipboardList className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  טופס שאלות מפגש
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הגדרת שאלות מותאמות אישית לתיעוד מפגשים ומעקב אחר התקדמות תלמידים
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('sessionForm')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <ClipboardList className="h-4 w-4" /> ניהול שאלות
              </Button>
            </CardContent>
          </Card>

          {/* Services Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-orange-100 p-2 text-orange-600 transition-colors group-hover:bg-orange-600 group-hover:text-white">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול שירותים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הוספת וניהול רשימת השירותים הזמינים למשתמשי הארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('services')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <ListChecks className="h-4 w-4" /> ניהול שירותים
              </Button>
            </CardContent>
          </Card>

          {/* Instructors Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                  <Users className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול מדריכים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הוספה, עריכה והשבתת מדריכים המשויכים לארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('instructors')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <Users className="h-4 w-4" /> ניהול מדריכים
              </Button>
            </CardContent>
          </Card>

          {/* Backup & Restore Card */}
          <Card className={`group relative w-full overflow-hidden border-0 shadow-md transition-all duration-200 flex flex-col ${
            backupEnabled ? 'bg-white/80 hover:shadow-xl hover:scale-[1.02]' : 'bg-slate-50 opacity-75'
          }`}>
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className={`rounded-lg p-2 transition-colors ${
                  backupEnabled 
                    ? 'bg-slate-100 text-slate-700 group-hover:bg-slate-700 group-hover:text-white' 
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className={`text-lg font-bold ${backupEnabled ? 'text-slate-900' : 'text-slate-500'}`}>
                  גיבוי ושחזור
                </CardTitle>
              </div>
              <p className={`text-sm leading-relaxed min-h-[2.5rem] ${backupEnabled ? 'text-slate-600' : 'text-slate-500'}`}>
                {backupEnabled 
                  ? 'יצירת קובץ גיבוי מוצפן של נתוני הארגון ושחזור מגיבוי קיים'
                  : 'גיבוי אינו זמין. נא לפנות לתמיכה על מנת לבחון הפעלת הפונקציה'
                }
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('backup')} 
                disabled={!canManageSessionForm || !backupEnabled}
                variant={(!canManageSessionForm || !backupEnabled) ? 'secondary' : 'default'}
              >
                <ShieldCheck className="h-4 w-4" /> ניהול גיבויים
              </Button>
            </CardContent>
          </Card>

          {/* Custom Logo Card */}
          <Card className={`group relative w-full overflow-hidden border-0 shadow-md transition-all duration-200 flex flex-col ${
            logoEnabled ? 'bg-white/80 hover:shadow-xl hover:scale-[1.02]' : 'bg-slate-50 opacity-75'
          }`}>
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className={`rounded-lg p-2 transition-colors ${
                  logoEnabled 
                    ? 'bg-pink-100 text-pink-600 group-hover:bg-pink-600 group-hover:text-white' 
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className={`text-lg font-bold ${logoEnabled ? 'text-slate-900' : 'text-slate-500'}`}>
                  לוגו מותאם אישית
                </CardTitle>
              </div>
              <p className={`text-sm leading-relaxed min-h-[2.5rem] ${logoEnabled ? 'text-slate-600' : 'text-slate-500'}`}>
                {logoEnabled 
                  ? 'הגדרת כתובת URL של לוגו מותאם אישית שיוצג ברחבי האפליקציה'
                  : 'לוגו מותאם אישית אינו זמין. נא לפנות לתמיכה'
                }
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('logo')} 
                disabled={!canManageSessionForm || !logoEnabled}
                variant={(!canManageSessionForm || !logoEnabled) ? 'secondary' : 'default'}
              >
                <Sparkles className="h-4 w-4" /> ניהול לוגו
              </Button>
            </CardContent>
          </Card>

          {/* Tags Manager Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-teal-100 p-2 text-teal-600 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                  <Tag className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול תגיות
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                יצירה, עריכה ומחיקה של תגיות לסיווג ותיוג תלמידים
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('tags')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <Tag className="h-4 w-4" /> ניהול תגיות
              </Button>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Floating dialog for the selected module */}
        <Dialog open={Boolean(selectedModule)} onOpenChange={handleModuleDialogChange}>
          <DialogContent hideDefaultClose className="max-w-5xl max-h-[90vh] p-0 gap-0 overflow-hidden bg-white border border-slate-200 shadow-2xl">
            <EnhancedDialogHeader
              icon={
                selectedModule === 'setup' ? <PlugZap /> :
                selectedModule === 'orgMembers' ? <Users /> :
                selectedModule === 'sessionForm' ? <ClipboardList /> :
                selectedModule === 'services' ? <ListChecks /> :
                selectedModule === 'instructors' ? <Users /> :
                selectedModule === 'backup' ? <ShieldCheck /> :
                selectedModule === 'logo' ? <Sparkles /> :
                selectedModule === 'tags' ? <Tag /> :
                null
              }
              title={
                selectedModule === 'setup' ? 'חיבור Supabase' :
                selectedModule === 'orgMembers' ? 'ניהול חברי צוות' :
                selectedModule === 'sessionForm' ? 'טופס שאלות מפגש' :
                selectedModule === 'services' ? 'ניהול שירותים' :
                selectedModule === 'instructors' ? 'ניהול מדריכים' :
                selectedModule === 'backup' ? 'גיבוי ושחזור' :
                selectedModule === 'logo' ? 'לוגו מותאם אישית' :
                selectedModule === 'tags' ? 'ניהול תגיות' :
                ''
              }
              onClose={() => setSelectedModule(null)}
            />
            
            <DialogHeader className="sr-only">
              <DialogTitle>ניהול הגדרות מערכת</DialogTitle>
              <DialogDescription>ניהול הגדרות מערכת</DialogDescription>
            </DialogHeader>

            {/* Content area with padding and scroll */}
            <div className="overflow-y-auto px-6 py-6 max-h-[calc(90vh-80px)] bg-slate-50/30">
              <div className="mx-auto max-w-4xl">
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
                {selectedModule === 'logo' && (
                  <LogoManager session={session} orgId={activeOrgId} />
                )}
                {selectedModule === 'tags' && (
                  <TagsManager />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </PageLayout>
  );
}
