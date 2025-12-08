import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DataMaintenanceHelpContent } from './DataMaintenanceHelpContent.jsx';

export function DataMaintenanceHelpDialog({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Info className="h-6 w-6 text-primary" />
            מדריך תחזוקת נתונים
          </DialogTitle>
          <DialogDescription className="text-right">
            עדכנו מספר תלמידים במקביל באמצעות אקסל
          </DialogDescription>
        </DialogHeader>
        
          <DataMaintenanceHelpContent />
      </DialogContent>
    </Dialog>
  );
}
