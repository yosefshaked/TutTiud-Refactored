import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertCircle, UserPlus, UserCheck, Calendar, Clock, CheckSquare, Square, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrg } from '@/org/OrgContext.jsx';
import { fetchLooseSessions, rejectLooseSession } from '@/features/sessions/api/loose-sessions.js';
import { Checkbox } from '@/components/ui/checkbox';
import ResolvePendingReportDialog from '../components/ResolvePendingReportDialog.jsx';
import BulkResolvePendingReportsDialog from '../components/BulkResolvePendingReportsDialog.jsx';
import { RejectReportDialog } from '../components/RejectReportDialog.jsx';
import { normalizeMembershipRole, isAdminRole } from '@/features/students/utils/endpoints.js';
import { mapLooseSessionError } from '@/lib/error-mapping.js';

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
  const [state, setState] = useState(REQUEST_STATE.idle);
  const [error, setError] = useState('');
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [reportToReject, setReportToReject] = useState(null);
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [bulkResolveDialogOpen, setBulkResolveDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedReportIds, setSelectedReportIds] = useState(new Set());

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

  const handleResolve = (report) => {
    setSelectedReport(report);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedReport(null);
  };

  const handleReject = (report) => {
    setReportToReject(report);
    setRejectDialogOpen(true);
  };

  const handleRejectDialogClose = () => {
    setRejectDialogOpen(false);
    setReportToReject(null);
  };

  const handleRejectConfirm = async (rejectReason) => {
    if (!reportToReject) return;

    try {
      await rejectLooseSession({
        sessionId: reportToReject.id,
        rejectReason,
        orgId: activeOrgId,
      });
      
      toast.success('הדיווח נדחה בהצלחה.');
      void loadReports();
    } catch (err) {
      console.error('Failed to reject report', err);
      const errorMessage = mapLooseSessionError(err?.message, 'reject') || 'דחיית הדיווח נכשלה.';
      toast.error(errorMessage);
      throw err; // Re-throw so dialog can handle loading state
    }
  };

  const handleBulkReject = () => {
    if (selectedReportIds.size === 0) {
      toast.error('נא לבחור לפחות דיווח אחד.');
      return;
    }
    setBulkRejectDialogOpen(true);
  };

  const handleBulkRejectDialogClose = () => {
    setBulkRejectDialogOpen(false);
  };

  const handleBulkRejectConfirm = async (rejectReason) => {
    if (selectedReportIds.size === 0) return;

    const reportIds = Array.from(selectedReportIds);
    let successCount = 0;
    let failCount = 0;

    // Process rejections sequentially to avoid overwhelming the server
    for (const sessionId of reportIds) {
      try {
        await rejectLooseSession({
          sessionId,
          rejectReason,
          orgId: activeOrgId,
        });
        successCount++;
      } catch (err) {
        console.error(`Failed to reject session ${sessionId}`, err);
        failCount++;
      }
    }

    // Clear selection and reload
    setSelectedReportIds(new Set());
    void loadReports();

    // Show summary toast
    if (failCount === 0) {
      toast.success(`${successCount} דיווחים נדחו בהצלחה.`);
    } else if (successCount === 0) {
      toast.error(`דחיית ${failCount} דיווחים נכשלה.`);
    } else {
      toast.warning(`${successCount} דיווחים נדחו בהצלחה, ${failCount} נכשלו.`);
    }
  };

  const isLoading = state === REQUEST_STATE.loading;
  const hasError = state === REQUEST_STATE.error;

  const serviceOptions = useMemo(() => {
    const unique = new Set();
    reports.forEach((report) => {
      const service = report?.service_context;
      if (service) unique.add(service);
    });
    return Array.from(unique);
  }, [reports]);

  const reasonOptions = useMemo(() => {
    const unique = new Set();
    reports.forEach((report) => {
      const reason = report?.metadata?.unassigned_details?.reason;
      if (reason) unique.add(reason);
    });
    return Array.from(unique);
  }, [reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      const name = report?.metadata?.unassigned_details?.name || '';
      const reason = report?.metadata?.unassigned_details?.reason || '';
      const reasonOther = report?.metadata?.unassigned_details?.reason_other || '';
      const service = report?.service_context || '';
      const createdBy = report?.metadata?.created_by || '';
      const query = searchQuery.trim().toLowerCase();

      if (query) {
        const haystack = `${name} ${reason} ${reasonOther} ${service} ${createdBy}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      if (serviceFilter && service !== serviceFilter) {
        return false;
      }

      if (reasonFilter && reason !== reasonFilter) {
        return false;
      }

      if (fromDate && report.date < fromDate) {
        return false;
      }

      if (toDate && report.date > toDate) {
        return false;
      }

      return true;
    });
  }, [reports, searchQuery, serviceFilter, reasonFilter, fromDate, toDate]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setServiceFilter('');
    setReasonFilter('');
    setFromDate('');
    setToDate('');
  };

  const handleToggleReport = (reportId) => {
    setSelectedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (selectedReportIds.size === filteredReports.length) {
      setSelectedReportIds(new Set());
    } else {
      setSelectedReportIds(new Set(filteredReports.map((r) => r.id)));
    }
  };

  const handleSelectAllWithSameName = (name) => {
    const matching = filteredReports.filter(
      (r) => r?.metadata?.unassigned_details?.name === name
    );
    setSelectedReportIds(new Set(matching.map((r) => r.id)));
    toast.info(`נבחרו ${matching.length} דיווחים עם השם "${name}"`);
  };

  const handleClearSelection = () => {
    setSelectedReportIds(new Set());
  };

  const handleBulkResolve = () => {
    if (selectedReportIds.size === 0) {
      toast.error('נא לבחור לפחות דיווח אחד.');
      return;
    }
    setBulkResolveDialogOpen(true);
  };

  const handleBulkResolveDialogClose = () => {
    setBulkResolveDialogOpen(false);
  };

  const handleBulkResolved = () => {
    setBulkResolveDialogOpen(false);
    setSelectedReportIds(new Set());
    void loadReports();
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
          {filteredReports.length > 0 && (
            <Badge variant="outline" className="text-lg px-3 py-1">
              {filteredReports.length}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {filteredReports.length > 0 && (
            <div className="mb-4 flex items-center gap-3 p-3 border rounded-lg bg-muted/30" dir="rtl">
              <Checkbox
                checked={selectedReportIds.size === filteredReports.length && filteredReports.length > 0}
                onCheckedChange={handleToggleAll}
                id="select-all"
              />
              <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                {selectedReportIds.size === filteredReports.length && filteredReports.length > 0
                  ? 'בטל בחירת הכל'
                  : 'בחר הכל'}
              </label>
              {selectedReportIds.size > 0 && (
                <>
                  <span className="text-sm text-neutral-600">({selectedReportIds.size} נבחרו)</span>
                  <Button size="sm" variant="outline" onClick={handleClearSelection}>
                    נקה בחירה
                  </Button>
                  {isAdminMember && (
                    <>
                      <Button size="sm" onClick={handleBulkResolve}>
                        שיוך מרובה
                      </Button>
                      <Button size="sm" variant="destructive" onClick={handleBulkReject}>
                        דחה מרובה
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4" dir="rtl">
            <Input
              placeholder="חיפוש לפי שם/סיבה/שירות/יוצר"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="סינון לפי שירות" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">כל השירותים</SelectItem>
                {serviceOptions.map((service) => (
                  <SelectItem key={service} value={service}>
                    {service}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger>
                <SelectValue placeholder="סינון לפי סיבה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">כל הסיבות</SelectItem>
                {reasonOptions.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {getReasonLabel(reason)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                placeholder="מתאריך"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                placeholder="עד תאריך"
              />
            </div>
            {(searchQuery || serviceFilter || reasonFilter || fromDate || toDate) && (
              <Button variant="outline" size="sm" className="w-full md:w-auto" onClick={handleResetFilters}>
                איפוס סינונים
              </Button>
            )}
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-neutral-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>טוען דיווחים...</span>
            </div>
          ) : hasError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error || 'טעינת הדיווחים נכשלה.'}
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
              <p className="text-lg font-medium">אין דיווחים ממתינים</p>
              <p className="text-sm mt-1">כל הדיווחים שוייכו לתלמידים.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredReports.map((report) => {
                const name = report?.metadata?.unassigned_details?.name || 'ללא שם';
                const reason = report?.metadata?.unassigned_details?.reason || '';
                const reasonOther = report?.metadata?.unassigned_details?.reason_other || '';
                const time = report?.metadata?.unassigned_details?.time || '';
                const service = report?.service_context || '';
                const createdBy = report?.metadata?.created_by || '';

                const isSelected = selectedReportIds.has(report.id);

                return (
                  <Card key={report.id} className={`border-2 transition-colors ${
                    isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/30'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleToggleReport(report.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-foreground">{name}</h3>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                              ממתין לשיוך
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-xs"
                              onClick={() => handleSelectAllWithSameName(name)}
                            >
                              בחר כל "{name}"
                            </Button>
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
                        </div>

                        <div className="flex flex-row sm:flex-col gap-2 sm:shrink-0">
                          {isAdminMember ? (
                            <>
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
                              <Button
                                onClick={() => handleReject(report)}
                                variant="destructive"
                                className="gap-2 flex-1 sm:flex-none"
                                size="sm"
                              >
                                <XCircle className="h-4 w-4" />
                                דחה
                              </Button>
                            </>
                          ) : (
                            <Button
                              disabled
                              variant="outline"
                              className="gap-2 flex-1 sm:flex-none"
                              size="sm"
                              title="רק מנהלים יכולים לטפל בדיווחים"
                            >
                              <AlertCircle className="h-4 w-4" />
                              לא זמין
                            </Button>
                          )}
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

      {reportToReject && (
        <RejectReportDialog
          open={rejectDialogOpen}
          onClose={handleRejectDialogClose}
          onReject={handleRejectConfirm}
          reportName={reportToReject?.metadata?.unassigned_details?.name}
        />
      )}

      <RejectReportDialog
        open={bulkRejectDialogOpen}
        onClose={handleBulkRejectDialogClose}
        onReject={handleBulkRejectConfirm}
        reportName={`${selectedReportIds.size} דיווחים`}
        isBulk={true}
      />

      <BulkResolvePendingReportsDialog
        open={bulkResolveDialogOpen}
        onClose={handleBulkResolveDialogClose}
        reports={filteredReports.filter((r) => selectedReportIds.has(r.id))}
        onResolved={handleBulkResolved}
      />
    </div>
  );
}
