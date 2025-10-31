import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EditStudentForm, { EditStudentFormFooter } from './EditStudentForm.jsx';

export default function EditStudentModal({ open, onClose, student, onSubmit, isSubmitting = false, error = '' }) {
  const handleCancel = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent 
        className="sm:max-w-xl"
        footer={
          <EditStudentFormFooter
            onSubmit={() => document.getElementById('edit-student-form')?.requestSubmit()}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        }
      >
        <DialogHeader>
          <DialogTitle>עריכת תלמיד</DialogTitle>
        </DialogHeader>
        <EditStudentForm
          student={student}
          onSubmit={onSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
          error={error}
          renderFooterOutside={true}
        />
      </DialogContent>
    </Dialog>
  );
}
