import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Database, AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api-client';

export default function SystemUpdatesManager({ session, orgId }) {
  const [checking, setChecking] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [migrationReport, setMigrationReport] = useState(null);

  // Check migration status on mount
  useEffect(() => {
    async function loadMigrationStatus() {
      if (!session || !orgId || checking) return;
      
      setChecking(true);
      try {
        const data = await authenticatedFetch('admin-run-migration', {
          session,
          method: 'POST',
          body: {
            org_id: orgId,
            check_only: true,
          },
        });

        setCheckResult(data?.check ?? null);
      } catch (error) {
        console.error('Failed to check migration status:', error);
        toast.error('שגיאה בבדיקת סטטוס מעבר', {
          description: error.message,
        });
      } finally {
        setChecking(false);
      }
    }
    
    loadMigrationStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  async function checkMigrationStatus() {
    if (!session || !orgId || checking) return;
    
    setChecking(true);
    try {
      const data = await authenticatedFetch('admin-run-migration', {
        session,
        method: 'POST',
        body: {
          org_id: orgId,
          check_only: true,
        },
      });

      setCheckResult(data?.check ?? null);
    } catch (error) {
      console.error('Failed to check migration status:', error);
      toast.error('שגיאה בבדיקת סטטוס מעבר', {
        description: error.message,
      });
    } finally {
      setChecking(false);
    }
  }

  async function runMigration() {
    if (!session || !orgId || migrating) return;
    
    setMigrating(true);
    setMigrationReport(null);
    
    try {
      const data = await authenticatedFetch('admin-run-migration', {
        session,
        method: 'POST',
        body: {
          org_id: orgId,
          check_only: false,
        },
      });
      setMigrationReport(data);
      
      if (data.success) {
        toast.success('המעבר הושלם בהצלחה!', {
          description: `${data.services_created || 0} שירותים נוצרו, ${data.session_records_linked || 0} דיווחי מפגש מקושרים`,
        });
        // Refresh check status
        await checkMigrationStatus();
      } else {
        toast.error('המעבר הסתיים עם שגיאות', {
          description: data.error || 'נא לבדוק את הלוג לפרטים נוספים',
        });
      }
    } catch (error) {
      console.error('Migration failed:', error);
      toast.error('שגיאה בביצוע המעבר', {
        description: error.message,
      });
    } finally {
      setMigrating(false);
    }
  }

  const isSchemaReady = checkResult?.schema_exists === true;
  const needsMigration = checkResult?.needs_migration === true;
  const unmigrated = checkResult?.unmigrated_count || 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-slate-900">עדכוני מערכת</h2>
        <p className="text-sm text-slate-600">
          שדרוג מסד הנתונים למבנה חדש עם תמיכה מלאה במספר שירותים ותבניות דיווח דינמיות.
        </p>
      </div>

      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" />
            סטטוס נוכחי
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {checking ? (
            <div className="flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>בודק סטטוס...</span>
            </div>
          ) : checkResult ? (
            <div className="space-y-3">
              {/* Schema Status */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium text-slate-700">סכמת טבלאות חדשה</span>
                {isSchemaReady ? (
                  <Badge variant="default" className="bg-green-100 text-green-800 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    קיימת
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    חסרה
                  </Badge>
                )}
              </div>

              {/* Migration Status */}
              {isSchemaReady && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">נתונים מיושנים</span>
                    {needsMigration && (
                      <span className="text-xs text-slate-500 mt-0.5">
                        {unmigrated} רשומות ממתינות למעבר
                      </span>
                    )}
                  </div>
                  {needsMigration ? (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 gap-1">
                      <Info className="h-3 w-3" />
                      דורש מעבר
                    </Badge>
                  ) : (
                    <Badge variant="default" className="bg-green-100 text-green-800 gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      מעודכן
                    </Badge>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500">לא נבדק</div>
          )}

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={checkMigrationStatus}
            disabled={checking}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            רענן סטטוס
          </Button>
        </CardContent>
      </Card>

      {/* Migration Info Alert */}
      {!isSchemaReady && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>סכמת הטבלאות החדשה חסרה</AlertTitle>
          <AlertDescription className="text-sm">
            יש להריץ את הסקריפט setup-sql.js על התשתית כדי ליצור את הטבלאות החדשות (Services, ReportTemplates).
            לאחר מכן, חזור לכאן כדי להריץ את המעבר.
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Action */}
      {isSchemaReady && needsMigration && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-amber-900">
              <AlertCircle className="h-5 w-5" />
              שדרוג נדרש
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-slate-700 space-y-2">
              <p>
                מסד הנתונים שלך מכיל <strong>{unmigrated} רשומות</strong> שמשתמשות במבנה הישן (מחרוזות שירות).
              </p>
              <p>
                המעבר יבצע את הפעולות הבאות:
              </p>
              <ul className="list-disc list-inside space-y-1 mr-4 text-slate-600">
                <li>יצירת רשומות שירות מהנתונים הקיימים</li>
                <li>קישור דיווחי מפגש לשירותים החדשים</li>
                <li>עדכון ברירות מחדל של תלמידים</li>
                <li>שמירת הנתונים הישנים לתמיכה לאחור</li>
              </ul>
              <p className="text-xs text-slate-500 mt-2">
                <strong>הערה:</strong> המעבר בטוח לחלוטין ולא ימחק נתונים קיימים.
                הנתונים הישנים יישארו במקומם לתמיכה לאחור.
              </p>
            </div>

            <Button
              onClick={runMigration}
              disabled={migrating}
              className="w-full gap-2"
            >
              {migrating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מבצע מעבר...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4" />
                  הפעל מעבר למערכת רב-שירותית
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Migration Success */}
      {isSchemaReady && !needsMigration && checkResult && (
        <Alert className="border-green-200 bg-green-50/50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-900">המערכת מעודכנת</AlertTitle>
          <AlertDescription className="text-sm text-green-800">
            מסד הנתונים שודרג בהצלחה למבנה רב-שירותי. כל הנתונים מקושרים כראוי.
          </AlertDescription>
        </Alert>
      )}

      {/* Migration Report */}
      {migrationReport && (
        <Card className={migrationReport.success ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {migrationReport.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-green-900">מעבר הושלם בהצלחה</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-900">מעבר הסתיים עם שגיאות</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">שירותים נוצרו:</dt>
                <dd className="font-medium">{migrationReport.services_created || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">דיווחי מפגש מקושרים:</dt>
                <dd className="font-medium">{migrationReport.session_records_linked || 0}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">תלמידים מעודכנים:</dt>
                <dd className="font-medium">{migrationReport.students_updated || 0}</dd>
              </div>
              {migrationReport.elapsed_ms && (
                <div className="flex justify-between">
                  <dt className="text-slate-600">זמן ביצוע:</dt>
                  <dd className="font-medium">{Math.round(migrationReport.elapsed_ms / 1000)} שניות</dd>
                </div>
              )}
              {migrationReport.error && (
                <div className="mt-2 p-2 bg-red-100 rounded text-red-800 text-xs">
                  <strong>שגיאה:</strong> {migrationReport.error}
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
