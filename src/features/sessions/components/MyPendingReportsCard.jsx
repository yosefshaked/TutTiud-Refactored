import { useCallback, useEffect, useState } from 'react';
import { Calendar, Clock, CheckCircle2, AlertCircle, Loader2, XCircle, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchLooseSessions } from '@/features/sessions/api/loose-sessions.js';
import ResubmitRejectedReportDialog from './ResubmitRejectedReportDialog.jsx';

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

export default function MyPendingReportsCard() {
  const { activeOrg, activeOrgHasConnection, tenantClientReady } = useOrg();
  const [state, setState] = useState(REQUEST_STATE.idle);
  const [error, setError] = useState('');
  const [reports, setReports] = useState([]);
  const [resubmitModalOpen, setResubmitModalOpen] = useState(false);
  const [resubmitReport, setResubmitReport] = useState(null);

  const activeOrgId = activeOrg?.id || null;
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

  const handleResubmit = useCallback((report) => {
    setResubmitReport(report);
    setResubmitModalOpen(true);
  }, []);

  const handleResubmitSuccess = useCallback(() => {
    setResubmitModalOpen(false);
    setResubmitReport(null);
    // Reload reports to update the list
    void loadReports();
  }, [loadReports]);

  const handleResubmitClose = useCallback(() => {
    setResubmitModalOpen(false);
    setResubmitReport(null);
  }, []);

  const isLoading = state === REQUEST_STATE.loading;
  const hasError = state === REQUEST_STATE.error;
  const pendingReports = reports.filter((r) => !r.student_id && !r.deleted && !r.isRejected);
  const rejectedReports = reports.filter((r) => r.isRejected === true || (r.deleted && r.metadata?.rejection));
  const resolvedReports = reports.filter((r) => r.student_id);

  if (!canFetch) {
    return null;
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="text-right">הדיווחים הממתינים שלי</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-neutral-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>טוען דיווחים...</span>
          </div>
        ) : hasError ? (
          <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            {error || 'טעינת הדיווחים נכשלה.'}
          </div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground text-right">
              דיווחים שהגשת ללא שיוך תלמיד. רק מנהל יכול לשייך דיווחים אלה לתלמידים.
            </div>

            {pendingReports.length === 0 && rejectedReports.length === 0 && resolvedReports.length === 0 && (
              <div className="text-center py-8 text-neutral-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
                <p className="text-lg font-medium">אין דיווחים ממתינים</p>
                <p className="text-sm mt-1">כל הדיווחים שהגשת שוייכו לתלמידים.</p>
              </div>
            )}

            {(pendingReports.length > 0 || rejectedReports.length > 0 || resolvedReports.length > 0) && (
              <Tabs defaultValue="pending" dir="rtl">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="pending" className="flex items-center gap-2">
                    ממתינים
                    {pendingReports.length > 0 && (
                      <Badge variant="secondary" className="bg-amber-500 text-white">
                        {pendingReports.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="rejected" className="flex items-center gap-2">
                    נדחו
                    {rejectedReports.length > 0 && (
                      <Badge variant="secondary" className="bg-red-500 text-white">
                        {rejectedReports.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="accepted" className="flex items-center gap-2">
                    אושרו
                    {resolvedReports.length > 0 && (
                      <Badge variant="secondary" className="bg-green-500 text-white">
                        {resolvedReports.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* Pending Tab */}
                <TabsContent value="pending" className="space-y-3 mt-4">
                  {pendingReports.length === 0 ? (
                    <div className="text-center py-8 text-neutral-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
                      <p className="text-sm">אין דיווחים ממתינים</p>
                    </div>
                  ) : (
                    pendingReports.map((report) => {
                      const name = report?.metadata?.unassigned_details?.name || 'ללא שם';
                      const reason = report?.metadata?.unassigned_details?.reason || '';
                      const reasonOther = report?.metadata?.unassigned_details?.reason_other || '';
                      const time = report?.metadata?.unassigned_details?.time || '';
                      const service = report?.service_context || '';

                      return (
                        <Card key={report.id} className="border-2 border-amber-200 bg-amber-50/30">
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-base font-semibold text-foreground">{name}</h4>
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
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                {/* Rejected Tab */}
                <TabsContent value="rejected" className="space-y-3 mt-4">
                  {rejectedReports.length === 0 ? (
                    <div className="text-center py-8 text-neutral-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
                      <p className="text-sm">אין דיווחים שנדחו</p>
                    </div>
                  ) : (
                    rejectedReports.map((report) => {
                      const name = report?.metadata?.unassigned_details?.name || 'ללא שם';
                      const reason = report?.metadata?.unassigned_details?.reason || '';
                      const reasonOther = report?.metadata?.unassigned_details?.reason_other || '';
                      const time = report?.metadata?.unassigned_details?.time || '';
                      const service = report?.service_context || '';
                      const rejectionReason = report?.metadata?.rejection?.reason || 'לא צוינה סיבה';
                      const rejectedAt = report?.metadata?.rejection?.rejected_at || report?.deleted_at || '';

                      return (
                        <Card key={report.id} className="border-2 border-red-200 bg-red-50/30">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-2">
                                    <h4 className="text-base font-semibold text-foreground">{name}</h4>
                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                                      <XCircle className="h-3 w-3 ml-1" />
                                      נדחה
                                    </Badge>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mb-3">
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

                                  <div className="rounded-md bg-red-100 p-3 text-sm">
                                    <p className="font-semibold text-red-900 mb-1">סיבת הדחייה:</p>
                                    <p className="text-red-800">{rejectionReason}</p>
                                    {rejectedAt && (
                                      <p className="text-xs text-red-600 mt-1">
                                        נדחה ב-{formatDate(rejectedAt.split('T')[0])}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => handleResubmit(report)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                  שלח מחדש
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </TabsContent>

                {/* Accepted Tab */}
                <TabsContent value="accepted" className="space-y-3 mt-4">
                  {resolvedReports.length === 0 ? (
                    <div className="text-center py-8 text-neutral-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-neutral-400" />
                      <p className="text-sm">אין דיווחים שאושרו</p>
                    </div>
                  ) : (
                    <>
                      {resolvedReports.slice(0, 5).map((report) => {
                        const name = report?.metadata?.unassigned_details?.name || 'ללא שם';
                        const service = report?.service_context || '';

                        return (
                          <Card key={report.id} className="border-2 border-green-200 bg-green-50/30">
                            <CardContent className="p-3">
                              <div className="flex items-center gap-2 text-sm">
                                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                                <span className="font-medium">{name}</span>
                                <span className="text-neutral-600">·</span>
                                <span className="text-neutral-600">{formatDate(report.date)}</span>
                                {service && (
                                  <>
                                    <span className="text-neutral-600">·</span>
                                    <span className="text-neutral-600">{service}</span>
                                  </>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                      {resolvedReports.length > 5 && (
                        <p className="text-xs text-neutral-500 text-center">
                          ועוד {resolvedReports.length - 5} דיווחים שטופלו
                        </p>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </CardContent>

      {/* Resubmit Modal */}
      <ResubmitRejectedReportDialog
        isOpen={resubmitModalOpen}
        onClose={handleResubmitClose}
        report={resubmitReport}
        onSuccess={handleResubmitSuccess}
      />
    </Card>
  );
}
