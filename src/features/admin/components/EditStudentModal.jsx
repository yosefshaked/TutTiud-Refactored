import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EditStudentForm from './EditStudentForm.jsx';

export default function EditStudentModal({ open, onClose, student, onSubmit, isSubmitting = false, error = '' }) {
  const handleCancel = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl pb-28 sm:pb-6">
        <DialogHeader>
          <DialogTitle>עריכת תלמיד</DialogTitle>
        </DialogHeader>
        <EditStudentForm
          student={student}
          onSubmit={onSubmit}
          onCancel={handleCancel}
          isSubmitting={isSubmitting}
          error={error}
        />
      </DialogContent>
    </Dialog>
  );
}
