import { useCallback, useEffect, useState } from 'react';
import { Calendar, Clock, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchLooseSessions } from '@/features/sessions/api/loose-sessions.js';

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

  const isLoading = state === REQUEST_STATE.loading;
  const hasError = state === REQUEST_STATE.error;
  const pendingReports = reports.filter((r) => !r.student_id && !r.deleted);
  const resolvedReports = reports.filter((r) => r.student_id);

  if (!canFetch) {
    return null;
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>הדיווחים הממתינים שלי</span>
          {pendingReports.length > 0 && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
              {pendingReports.length}
            </Badge>
          )}
        </CardTitle>
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

            {pendingReports.length === 0 && resolvedReports.length === 0 && (
              <div className="text-center py-8 text-neutral-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
                <p className="text-lg font-medium">אין דיווחים ממתינים</p>
                <p className="text-sm mt-1">כל הדיווחים שהגשת שוייכו לתלמידים.</p>
              </div>
            )}

            {/* Pending Reports */}
            {pendingReports.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-right">ממתינים לטיפול מנהל ({pendingReports.length})</h3>
                {pendingReports.map((report) => {
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
                })}
              </div>
            )}

            {/* Resolved Reports */}
            {resolvedReports.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-right text-green-700">טופלו ({resolvedReports.length})</h3>
                {resolvedReports.slice(0, 3).map((report) => {
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
                {resolvedReports.length > 3 && (
                  <p className="text-xs text-neutral-500 text-center">
                    ועוד {resolvedReports.length - 3} דיווחים שטופלו
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
