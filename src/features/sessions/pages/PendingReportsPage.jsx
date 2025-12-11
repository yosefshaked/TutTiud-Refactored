import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, AlertCircle, UserPlus, UserCheck, Calendar, Clock, CheckSquare, Square, XCircle, ChevronDown, ChevronUp, Filter, Eye, MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
  const [showFilters, setShowFilters] = useState(false);
  const [reportViewOpen, setReportViewOpen] = useState(false);
  const [reportToView, setReportToView] = useState(null);

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

  const handleViewReport = (report) => {
    setReportToView(report);
    setReportViewOpen(true);
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
      const instructorName = report?.Instructors?.name || report?.Instructors?.email || '';
      const query = searchQuery.trim().toLowerCase();

      if (query) {
        const haystack = `${name} ${reason} ${reasonOther} ${service} ${instructorName}`.toLowerCase();
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
          
          {/* Search bar - always visible */}
          <div className="mb-3">
            <Input
              placeholder="חיפוש לפי שם/סיבה/שירות/מדריך"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              dir="rtl"
            />
          </div>

          {/* Filter toggle button */}
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              <span>סינון מתקדם</span>
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {(serviceFilter || reasonFilter || fromDate || toDate) && (
                <Badge variant="secondary" className="mr-2">פעיל</Badge>
              )}
            </Button>
          </div>

          {/* Collapsible filter section */}
          {showFilters && (
            <div className="mb-4 space-y-3 animate-in fade-in slide-in-from-top-2" dir="rtl">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Select value={serviceFilter || 'all'} onValueChange={(val) => setServiceFilter(val === 'all' ? '' : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="סינון לפי שירות" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל השירותים</SelectItem>
                    {serviceOptions.map((service) => (
                      <SelectItem key={service} value={service}>
                        {service}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={reasonFilter || 'all'} onValueChange={(val) => setReasonFilter(val === 'all' ? '' : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="סינון לפי סיבה" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הסיבות</SelectItem>
                    {reasonOptions.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {getReasonLabel(reason)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">מתאריך</label>
                  <Input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-neutral-700">עד תאריך</label>
                  <Input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {(serviceFilter || reasonFilter || fromDate || toDate) && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleResetFilters}>
                  איפוס סינונים
                </Button>
              )}
            </div>
          )}

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
                const instructorName = report?.Instructors?.name || report?.Instructors?.email || 'לא ידוע';

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

                          <p className="text-xs text-neutral-500">
                            נוצר על ידי: {instructorName}
                          </p>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          {isAdminMember ? (
                            <DropdownMenu dir="rtl">
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-full h-10 w-10 p-0"
                                  title="אפשרויות"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => handleViewReport(report)} className="gap-2 cursor-pointer">
                                  <Eye className="h-4 w-4" />
                                  <span>צפייה בתוכן הדיווח</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleResolve(report)} className="gap-2 cursor-pointer">
                                  <UserCheck className="h-4 w-4" />
                                  <span>שיוך קיים</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleResolve(report)} className="gap-2 cursor-pointer">
                                  <UserPlus className="h-4 w-4" />
                                  <span>יצירה ושיוך</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleReject(report)} className="gap-2 cursor-pointer text-red-600 hover:text-red-700">
                                  <XCircle className="h-4 w-4" />
                                  <span>דחה</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <Button
                              disabled
                              variant="outline"
                              size="sm"
                              className="rounded-full h-10 w-10 p-0"
                              title="רק מנהלים יכולים לטפל בדיווחים"
                            >
                              <AlertCircle className="h-4 w-4" />
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

      {/* Report Content Viewer Dialog */}
      <Dialog open={reportViewOpen} onOpenChange={setReportViewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>תוכן הדיווח</DialogTitle>
          </DialogHeader>
          {reportToView && (
            <div className="space-y-4">
              <div className="rounded-lg bg-neutral-50 p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">שם התלמיד:</span>
                    <span>{reportToView?.metadata?.unassigned_details?.name || 'לא צוין'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">מדריך:</span>
                    <span>{reportToView?.Instructors?.name || reportToView?.Instructors?.email || 'לא ידוע'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">תאריך:</span>
                    <span>{formatDate(reportToView?.date)}</span>
                  </div>
                  {reportToView?.metadata?.unassigned_details?.time && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900">שעה:</span>
                      <span>{formatTime(reportToView?.metadata?.unassigned_details?.time)}</span>
                    </div>
                  )}
                  {reportToView?.service_context && (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-900">שירות:</span>
                      <span>{reportToView?.service_context}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900">סיבה:</span>
                    <span>{getReasonLabel(reportToView?.metadata?.unassigned_details?.reason, reportToView?.metadata?.unassigned_details?.reason_other)}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-neutral-900">תוכן הדיווח:</h3>
                <div className="rounded-lg bg-neutral-50 p-4 whitespace-pre-wrap text-sm text-neutral-700 max-h-96 overflow-y-auto">
                  {typeof reportToView?.content === 'string'
                    ? reportToView.content
                    : typeof reportToView?.content === 'object' && reportToView.content
                      ? JSON.stringify(reportToView.content, null, 2)
                      : 'לא הוזן תוכן'}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <BulkResolvePendingReportsDialog
        open={bulkResolveDialogOpen}
        onClose={handleBulkResolveDialogClose}
        reports={filteredReports.filter((r) => selectedReportIds.has(r.id))}
        onResolved={handleBulkResolved}
      />
    </div>
  );
}
