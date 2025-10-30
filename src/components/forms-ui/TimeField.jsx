import React from 'react';
import FormField from './FormField';
import TimePickerInput from '@/components/ui/TimePickerInput';

export default function TimeField({
  id,
  name,
  label,
  value,
  onChange,
  placeholder = 'בחר שעה',
  required = false,
  disabled = false,
  description = '',
  error = '',
  className,
}) {
  return (
    <FormField id={id} label={label} required={required} description={description} error={error}>
      <TimePickerInput
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className}
      />
    </FormField>
  );
}
