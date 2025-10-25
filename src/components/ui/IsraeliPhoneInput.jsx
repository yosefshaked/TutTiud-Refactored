import React from 'react';
import { Input } from '@/components/ui/input';

const ISRAELI_PHONE_PATTERN = /^(?:0(?:5[0-9]|[2-4|8-9][0-9])-?\d{7}|(?:\+?972-?)?5[0-9]-?\d{7})$/;

export function validateIsraeliPhone(value) {
  if (!value) return true; // Empty is valid if not required
  const normalized = value.replace(/[\s-]/g, '');
  return ISRAELI_PHONE_PATTERN.test(normalized);
}

export default function IsraeliPhoneInput({ value, onChange, onBlur, error, required, disabled, ...props }) {
  const handleChange = (e) => {
    onChange?.(e);
  };

  return (
    <div className="space-y-1">
      <Input
        type="tel"
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        required={required}
        disabled={disabled}
        dir="ltr"
        placeholder="05X-XXXXXXX"
        {...props}
      />
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-slate-500">
        פורמט: 05X-XXXXXXX או 972-5X-XXXXXXX
      </p>
    </div>
  );
}
