import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertCircle, UserPlus, UserCheck, Calendar, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrg } from '@/org/OrgContext.jsx';
import { useSupabase } from '@/context/SupabaseContext.jsx';
import { fetchLooseSessions } from '@/features/sessions/api/loose-sessions.js';
import ResolvePendingReportDialog from '../components/ResolvePendingReportDialog.jsx';
import { normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';

const REQUEST_STATE = Object.freeze({
  idle: 'idle',
  loading: 'loading',
  error: 'error',
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.substring(0, 5); // HH:MM from HH:MM:SS
}

function getReasonLabel(reason, reasonOther) {
  const labels = {
    substitute: 'מחליף זמני',
    new_student: 'תלמיד חדש',
    other: reasonOther || 'אחר',
  };
  return labels[reason] || reason || 'לא צוין';
}

export default function PendingReportsPage() {
  const { activeOrg, activeOrgHasConnection, tenantClientReady } = useOrg();
  const { loading: supabaseLoading } = useSupabase();
  const [state, setState] = useState(REQUEST_STATE.idle);
  const [error, setError] = useState('');
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const activeOrgId = activeOrg?.id || null;

  // Admin-only access control
  const membershipRole = activeOrg?.membership?.role;
  const normalizedRole = useMemo(() => normalizeMembershipRole(membershipRole), [membershipRole]);
  const isAdminMember = isAdminRole(normalizedRole);

  const canFetch = Boolean(activeOrgId && activeOrgHasConnection && tenantClientReady);

  const loadReports = useCallback(async (options = {}) => {
    if (!canFetch) return;

    setState(REQUEST_STATE.loading);
    setError('');

    try {
      const data = await fetchLooseSessions({ 
        orgId: activeOrgId,
        signal: options.signal,
      });
      setReports(Array.isArray(data) ? data : []);
      setState(REQUEST_STATE.idle);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to load pending reports', err);
      setError(err?.message || 'טעינת הדיווחים הממתינים נכשלה.');
      setState(REQUEST_STATE.error);
    }
  }, [canFetch, activeOrgId]);

  useEffect(() => {
    if (!canFetch) {
      setState(REQUEST_STATE.idle);
      setError('');
      setReports([]);
      return;
    }

    const abortController = new AbortController();
    void loadReports({ signal: abortController.signal });

    return () => {
      abortController.abort();
    };
  }, [canFetch, loadReports]);

  const handleResolved = useCallback(() => {
    setDialogOpen(false);
    setSelectedReport(null);
    toast.success('הדיווח שוייך בהצלחה.');
    void loadReports();
  }, [loadReports]);

  // Redirect non-admin users (after all hooks)
  if (!supabaseLoading && !isAdminMember) {
    return <Navigate to="/my-students" replace />;
  }

  const handleResolve = (report) => {
    setSelectedReport(report);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedReport(null);
  };

  if (!canFetch) {
    return (
      <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
        <Card>
          <CardHeader>
            <CardTitle>דיווחים ממתינים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-neutral-600">
              <AlertCircle className="h-5 w-5" />
              <p>יש לבחור ארגון בעל חיבור פעיל כדי לצפות בדיווחים ממתינים.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = state === REQUEST_STATE.loading;
  const hasError = state === REQUEST_STATE.error;

  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl" dir="rtl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-2xl font-bold">דיווחים ממתינים</CardTitle>
            <p className="text-sm text-neutral-500 mt-1">
              דיווחי מפגשים שממתינים לשיוך תלמיד
            </p>
          </div>
          {reports.length > 0 && (
            <Badge variant="outline" className="text-lg px-3 py-1">
              {reports.length}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-neutral-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>טוען דיווחים...</span>
            </div>
          ) : hasError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error || 'טעינת הדיווחים נכשלה.'}
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
              <p className="text-lg font-medium">אין דיווחים ממתינים</p>
              <p className="text-sm mt-1">כל הדיווחים שוייכו לתלמידים.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const name = report?.metadata?.unassigned_details?.name || 'ללא שם';
                const reason = report?.metadata?.unassigned_details?.reason || '';
                const reasonOther = report?.metadata?.unassigned_details?.reason_other || '';
                const time = report?.metadata?.unassigned_details?.time || '';
                const service = report?.service_context || '';
                const createdBy = report?.metadata?.created_by || '';

                return (
                  <Card key={report.id} className="border-2 hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                              ממתין לשיוך
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2 text-neutral-600">
                              <Calendar className="h-4 w-4 shrink-0" />
                              <span>תאריך: {formatDate(report.date)}</span>
                            </div>
                            {time && (
                              <div className="flex items-center gap-2 text-neutral-600">
                                <Clock className="h-4 w-4 shrink-0" />
                                <span>שעה: {formatTime(time)}</span>
                              </div>
                            )}
                            {service && (
                              <div className="flex items-center gap-2 text-neutral-600">
                                <span className="font-medium">שירות:</span>
                                <span>{service}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-neutral-600">
                              <span className="font-medium">סיבה:</span>
                              <span>{getReasonLabel(reason, reasonOther)}</span>
                            </div>
                          </div>

                          {createdBy && (
                            <p className="text-xs text-neutral-500">
                              נוצר על ידי: {createdBy}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-row sm:flex-col gap-2 sm:shrink-0">
                          <Button
                            onClick={() => handleResolve(report)}
                            className="gap-2 flex-1 sm:flex-none"
                            size="sm"
                          >
                            <UserCheck className="h-4 w-4" />
                            שיוך קיים
                          </Button>
                          <Button
                            onClick={() => handleResolve(report)}
                            variant="outline"
                            className="gap-2 flex-1 sm:flex-none"
                            size="sm"
                          >
                            <UserPlus className="h-4 w-4" />
                            יצירה ושיוך
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedReport && (
        <ResolvePendingReportDialog
          open={dialogOpen}
          onClose={handleDialogClose}
          report={selectedReport}
          onResolved={handleResolved}
        />
      )}
    </div>
  );
}
