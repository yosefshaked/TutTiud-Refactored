import React from 'react';
import FormField from './FormField';
import IsraeliPhoneInput from '@/components/ui/IsraeliPhoneInput';

export default function PhoneField({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  description = '',
  error = '',
  className,
}) {
  return (
    <FormField id={id} label={label} required={required} description={description} error={error}>
      <IsraeliPhoneInput
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className}
        error={error}
      />
    </FormField>
  );
}
