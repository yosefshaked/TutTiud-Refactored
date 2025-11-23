import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDialogHeader } from '@/components/ui/DialogHeader';
import { PlugZap, Sparkles, Users, ListChecks, ClipboardList, ShieldCheck, Tag, EyeOff, HardDrive, FileText, Briefcase } from 'lucide-react';
import SetupAssistant from '@/components/settings/SetupAssistant.jsx';
import OrgMembersCard from '@/components/settings/OrgMembersCard.jsx';
import SessionFormManager from '@/components/settings/SessionFormManager.jsx';
import ServiceManager from '@/components/settings/ServiceManager.jsx';
import InstructorManager from '@/components/settings/InstructorManager.jsx';
import BackupManager from '@/components/settings/BackupManager.jsx';
import LogoManager from '@/components/settings/LogoManager.jsx';
import TagsManager from '@/components/settings/TagsManager.jsx';
import StudentVisibilitySettings from '@/components/settings/StudentVisibilitySettings.jsx';
import StorageSettingsCard from '@/components/settings/StorageSettingsCard.jsx';
import DocumentRulesManager from '@/components/settings/DocumentRulesManager.jsx';
import MyInstructorDocuments from '@/components/settings/MyInstructorDocuments.jsx';
import { OnboardingCard } from '@/features/onboarding/components/OnboardingCard.jsx';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import PageLayout from '@/components/ui/PageLayout.jsx';

export default function Settings() {
  const { activeOrg, activeOrgHasConnection, tenantClientReady, activeOrgId, enableDirectory, disableDirectory, refreshOrganizations } = useOrg();
  const { authClient, user, loading, session } = useSupabase();
  const membershipRole = activeOrg?.membership?.role ?? null;
  const normalizedRole = typeof membershipRole === 'string' ? membershipRole.trim().toLowerCase() : '';
  const canManageSessionForm = normalizedRole === 'admin' || normalizedRole === 'owner';
  const setupDialogAutoOpenRef = useRef(!activeOrgHasConnection);
  const [selectedModule, setSelectedModule] = useState(null); // 'setup' | 'orgMembers' | 'sessionForm' | 'services' | 'instructors' | 'backup' | 'logo' | 'tags' | 'studentVisibility' | 'storage' | 'documents'
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [logoEnabled, setLogoEnabled] = useState(false);
  const [storageEnabled, setStorageEnabled] = useState(false);
  const [refreshingPermissions, setRefreshingPermissions] = useState(false);

  // Fetch backup permissions and initialize if empty using the proper RPC function
  useEffect(() => {
    if (!activeOrgId || !authClient) return;
    
    const fetchAndInitializePermissions = async () => {
      try {
        // Use the initialize_org_permissions RPC function
        // This function checks if permissions are null/empty and initializes them if needed
        const { data: permissions, error: initError } = await authClient
          .rpc('initialize_org_permissions', { p_org_id: activeOrgId });
        
        if (initError) {
          console.error('Error initializing permissions:', initError);
          setBackupEnabled(false);
          setLogoEnabled(false);
          setStorageEnabled(false);
          return;
        }
        
        console.log('Permissions initialized/fetched successfully');
        
        // Refresh organizations context to reload updated permissions
        if (refreshOrganizations) {
          try {
            await refreshOrganizations({ keepSelection: true });
            console.log('Organizations context refreshed after permission initialization');
          } catch (refreshError) {
            console.error('Error refreshing organizations context:', refreshError);
          }
        }
        
        setBackupEnabled(permissions?.backup_local_enabled === true);
        setLogoEnabled(permissions?.logo_enabled === true);
        // Storage is enabled if storage_access_level is not false (can be byos_only, managed_only, or all)
        setStorageEnabled(permissions?.storage_access_level && permissions.storage_access_level !== false);
      } catch (err) {
        console.error('Error in permissions initialization:', err);
        setBackupEnabled(false);
        setLogoEnabled(false);
        setStorageEnabled(false);
      }
    };
    
    fetchAndInitializePermissions();
  }, [activeOrgId, authClient, refreshOrganizations]);

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

  // Manual permission refresh handler - adds missing permissions without overwriting existing
  const handleRefreshPermissions = async () => {
    if (!activeOrgId || !authClient || refreshingPermissions) return;
    
    setRefreshingPermissions(true);
    try {
      // Get current permissions
      const { data: orgSettings, error: fetchError } = await authClient
        .from('org_settings')
        .select('permissions')
        .eq('org_id', activeOrgId)
        .single();
      
      if (fetchError) {
        console.error('Error fetching current permissions:', fetchError);
        toast.error('שגיאה בטעינת הרשאות נוכחיות');
        return;
      }
      
      // Get default permissions from registry
      const { data: defaults, error: defaultsError } = await authClient
        .rpc('get_default_permissions');
      
      if (defaultsError) {
        console.error('Error fetching default permissions:', defaultsError);
        toast.error('שגיאה בטעינת הרשאות ברירת מחדל');
        return;
      }
      
      // Merge: only add missing permissions, preserve existing values
      const currentPermissions = orgSettings?.permissions || {};
      const mergedPermissions = { ...currentPermissions };
      
      // Add only missing keys from defaults
      for (const [key, value] of Object.entries(defaults || {})) {
        if (!(key in mergedPermissions)) {
          mergedPermissions[key] = value;
          console.log(`Adding missing permission: ${key} = ${JSON.stringify(value)}`);
        }
      }
      
      // Update org_settings with merged permissions
      const { error: updateError } = await authClient
        .from('org_settings')
        .update({ permissions: mergedPermissions })
        .eq('org_id', activeOrgId);
      
      if (updateError) {
        console.error('Error updating permissions:', updateError);
        toast.error('שגיאה בעדכון הרשאות');
        return;
      }
      
      console.log('Permissions merged successfully (missing permissions added, existing preserved)');
      
      // Update local state
      setBackupEnabled(mergedPermissions?.backup_local_enabled === true);
      setLogoEnabled(mergedPermissions?.logo_enabled === true);
      setStorageEnabled(mergedPermissions?.storage_access_level && mergedPermissions.storage_access_level !== false);
      
      // Refresh organizations context
      if (refreshOrganizations) {
        await refreshOrganizations({ keepSelection: true });
        console.log('Organizations context refreshed after permission merge');
      }
      
      toast.success('ההרשאות עודכנו בהצלחה');
    } catch (err) {
      console.error('Error refreshing permissions:', err);
      toast.error('שגיאה בעדכון הרשאות');
    } finally {
      setRefreshingPermissions(false);
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
            <div className="flex items-center justify-between">
              <div className="space-y-xs">
                <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg md:text-xl">מידע לניפוי באגים</CardTitle>
                <p className="text-xs text-slate-600 sm:text-sm">
                  שימוש בנתונים אלו מאפשר להבין איך האפליקציה מזהה את המשתמש הנוכחי וההרשאות שלו.
                </p>
              </div>
              {canManageSessionForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshPermissions}
                  disabled={refreshingPermissions || !authClient}
                  className="gap-2"
                >
                  <Sparkles className={`h-4 w-4 ${refreshingPermissions ? 'animate-spin' : ''}`} />
                  רענן הרשאות
                </Button>
              )}
            </div>
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

          {/* Student Visibility Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-sky-100 p-2 text-sky-600 transition-colors group-hover:bg-sky-600 group-hover:text-white">
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  תצוגת תלמידים לא פעילים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הגדרת הגישה של מדריכים לתלמידים שסומנו כלא פעילים במערכת.
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button
                size="sm"
                className="w-full gap-2"
                onClick={() => setSelectedModule('studentVisibility')}
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <EyeOff className="h-4 w-4" /> ניהול תצוגת תלמידים
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

          {/* Tags and Types Manager Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-teal-100 p-2 text-teal-600 transition-colors group-hover:bg-teal-600 group-hover:text-white">
                  <Tag className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול תגיות וסיווגים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                ניהול תגיות לתלמידים וסיווגים למדריכים
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
                <Tag className="h-4 w-4" /> ניהול תגיות וסיווגים
              </Button>
            </CardContent>
          </Card>

          {/* Storage Settings Card */}
          <Card className={`group relative w-full overflow-hidden border-0 shadow-md transition-all duration-200 flex flex-col ${
            storageEnabled ? 'bg-white/80 hover:shadow-xl hover:scale-[1.02]' : 'bg-slate-50 opacity-75'
          }`}>
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className={`rounded-lg p-2 transition-colors ${
                  storageEnabled 
                    ? 'bg-cyan-100 text-cyan-600 group-hover:bg-cyan-600 group-hover:text-white' 
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <HardDrive className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className={`text-lg font-bold ${storageEnabled ? 'text-slate-900' : 'text-slate-500'}`}>
                  הגדרות אחסון
                </CardTitle>
              </div>
              <p className={`text-sm leading-relaxed min-h-[2.5rem] ${storageEnabled ? 'text-slate-600' : 'text-slate-500'}`}>
                {storageEnabled 
                  ? 'הגדרת מצב אחסון קבצים - אחסון מנוהל או BYOS (אחסון משלך)'
                  : 'הגדרות אחסון אינן זמינות. נא לפנות לתמיכה'
                }
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('storage')} 
                disabled={!canManageSessionForm || !storageEnabled}
                variant={(!canManageSessionForm || !storageEnabled) ? 'secondary' : 'default'}
              >
                <HardDrive className="h-4 w-4" /> ניהול אחסון
              </Button>
            </CardContent>
          </Card>

          {/* Document Rules Manager Card */}
          <Card className="group relative w-full overflow-hidden border-0 bg-white/80 shadow-md transition-all duration-200 hover:shadow-xl hover:scale-[1.02] flex flex-col">
            <CardHeader className="space-y-2 pb-3 flex-1">
              <div className="flex items-start gap-2">
                <div className="rounded-lg bg-amber-100 p-2 text-amber-600 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  ניהול מסמכים
                </CardTitle>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed min-h-[2.5rem]">
                הגדרת רשימת מסמכים תקניים ומחויבים עבור תלמידי הארגון
              </p>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button 
                size="sm" 
                className="w-full gap-2" 
                onClick={() => setSelectedModule('documents')} 
                disabled={!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady}
                variant={(!canManageSessionForm || !activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
              >
                <FileText className="h-4 w-4" /> ניהול מסמכים
              </Button>
            </CardContent>
          </Card>

          {/* Instructor Documents - For instructors to view/upload their own files */}
          {!canManageSessionForm && activeOrgHasConnection && tenantClientReady && (
            <Card dir="rtl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle>המסמכים שלי</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        צפייה והעלאת מסמכים אישיים
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  הצג והעלה מסמכים נדרשים ומסמכים נוספים.
                </p>
                <Button
                  onClick={() => setSelectedModule('myDocuments')}
                  disabled={!activeOrgHasConnection || !tenantClientReady}
                  variant={(!activeOrgHasConnection || !tenantClientReady) ? 'secondary' : 'default'}
                >
                  <FileText className="ml-2 h-4 w-4" />
                  ניהול המסמכים שלי
                </Button>
              </CardContent>
            </Card>
          )}
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
                selectedModule === 'studentVisibility' ? <EyeOff /> :
                selectedModule === 'storage' ? <HardDrive /> :
                selectedModule === 'documents' ? <FileText /> :
                selectedModule === 'myDocuments' ? <FileText /> :
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
                selectedModule === 'tags' ? 'ניהול תגיות וסיווגים' :
                selectedModule === 'studentVisibility' ? 'תצוגת תלמידים לא פעילים' :
                selectedModule === 'storage' ? 'הגדרות אחסון' :
                selectedModule === 'documents' ? 'ניהול מסמכים' :
                selectedModule === 'myDocuments' ? 'המסמכים שלי' :
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
                {selectedModule === 'studentVisibility' && (
                  <StudentVisibilitySettings
                    session={session}
                    orgId={activeOrgId}
                    activeOrgHasConnection={activeOrgHasConnection}
                  />
                )}
                {selectedModule === 'storage' && (
                  <StorageSettingsCard session={session} orgId={activeOrgId} />
                )}
                {selectedModule === 'documents' && (
                  <DocumentRulesManager session={session} orgId={activeOrgId} />
                )}
                {selectedModule === 'myDocuments' && (
                  <MyInstructorDocuments session={session} orgId={activeOrgId} userId={user?.id} />
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </PageLayout>
  );
}
