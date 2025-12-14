import { useState, useCallback } from 'react';
import { Calendar, Clock, RotateCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrg } from '@/org/OrgContext.jsx';
import { useAuth } from '@/auth/AuthContext.jsx';
import { authenticatedFetch } from '@/lib/api-client.js';

const REASON_OPTIONS = [
  { value: 'substitute', label: 'מחליף זמני' },
  { value: 'new_student', label: 'תלמיד חדש' },
  { value: 'other', label: 'אחר' },
];

function formatDateForDisplay(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export default function ResubmitRejectedReportDialog({
  isOpen,
  onClose,
  report,
  onSuccess,
}) {
  const { activeOrg } = useOrg();
  const { session } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const unassignedDetails = report?.metadata?.unassigned_details || {};
  const rejectionInfo = report?.metadata?.rejection || {};
  
  const [formData, setFormData] = useState({
    name: unassignedDetails.name || '',
    reason: unassignedDetails.reason || 'other',
    reasonOther: unassignedDetails.reason_other || '',
    date: report?.date || '',
    time: unassignedDetails.time || '',
    service: report?.service_context || '',
  });

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('נא להזין שם');
      return;
    }
    
    if (!formData.date) {
      toast.error('נא לבחור תאריך');
      return;
    }
    
    if (!formData.time) {
      toast.error('נא להזין שעה');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        org_id: activeOrg?.id,
        date: formData.date,
        service_context: formData.service || null,
        content: report?.content || '',
        metadata: {
          unassigned_details: {
            name: formData.name.trim(),
            reason: formData.reason,
            reason_other: formData.reason === 'other' ? formData.reasonOther : '',
            time: formData.time,
          },
          resubmitted_from: report?.id,
          original_rejection: rejectionInfo,
        },
      };

      const response = await authenticatedFetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        session,
        signal: null,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.message || 'שגיאה בשליחת הדיווח');
      }

      toast.success('הדיווח נשלח מחדש בהצלחה');
      onSuccess?.();
    } catch (error) {
      console.error('Failed to resubmit report', error);
      toast.error(error?.message || 'שליחת הדיווח נכשלה');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, report, activeOrg, session, rejectionInfo, onSuccess]);

  if (!report) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            שליחה מחדש של דיווח שנדחה
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rejection Info */}
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <h3 className="font-semibold text-red-900 mb-2">סיבת הדחייה המקורית:</h3>
            <p className="text-red-800 text-sm">{rejectionInfo.reason || 'לא צוינה סיבה'}</p>
            {rejectionInfo.rejected_at && (
              <p className="text-xs text-red-600 mt-1">
                נדחה ב-{formatDateForDisplay(rejectionInfo.rejected_at.split('T')[0])}
              </p>
            )}
          </div>

          {/* Form Fields */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="name" className="block text-right mb-1">
                שם התלמיד <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                dir="rtl"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="הזן שם"
                required
              />
            </div>

            <div>
              <Label htmlFor="reason" className="block text-right mb-1">
                סיבה <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.reason}
                onValueChange={(value) => handleInputChange('reason', value)}
              >
                <SelectTrigger id="reason" dir="rtl">
                  <SelectValue placeholder="בחר סיבה" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {REASON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.reason === 'other' && (
              <div>
                <Label htmlFor="reasonOther" className="block text-right mb-1">
                  פירוט הסיבה
                </Label>
                <Textarea
                  id="reasonOther"
                  dir="rtl"
                  value={formData.reasonOther}
                  onChange={(e) => handleInputChange('reasonOther', e.target.value)}
                  placeholder="פרט את הסיבה"
                  rows={2}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="date" className="block text-right mb-1 flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  תאריך <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="time" className="block text-right mb-1 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  שעה <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="time"
                  type="time"
                  dir="ltr"
                  value={formData.time}
                  onChange={(e) => handleInputChange('time', e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="service" className="block text-right mb-1">
                שירות
              </Label>
              <Input
                id="service"
                dir="rtl"
                value={formData.service}
                onChange={(e) => handleInputChange('service', e.target.value)}
                placeholder="שם השירות (אופציונלי)"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  שלח מחדש
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
