import React from 'react';
import { Label } from '@/components/ui/label';

export default function FormField({
  id,
  label,
  required = false,
  description = '',
  error = '',
  children,
}) {
  return (
    <div className="space-y-2" dir="rtl">
      {label ? (
        <Label htmlFor={id} className="block text-right">
          {label}
          {required ? ' *' : ''}
        </Label>
      ) : null}
      {children}
      {description ? (
        <p className="text-xs text-neutral-500 text-right">{description}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600 text-right" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
