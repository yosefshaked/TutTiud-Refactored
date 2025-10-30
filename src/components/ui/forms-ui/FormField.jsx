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
    <div className="space-y-2">
      {label ? (
        <Label htmlFor={id}>
          {label}
          {required ? ' *' : ''}
        </Label>
      ) : null}
      {children}
      {description ? (
        <p className="text-xs text-neutral-500">{description}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-600" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
