import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DAYS_OF_WEEK = [
  { value: 1, label: 'ראשון' },
  { value: 2, label: 'שני' },
  { value: 3, label: 'שלישי' },
  { value: 4, label: 'רביעי' },
  { value: 5, label: 'חמישי' },
  { value: 6, label: 'שישי' },
  { value: 7, label: 'שבת' },
];

export default function DayOfWeekSelect({ value, onChange, disabled, required, placeholder = 'בחר יום' }) {
  const handleValueChange = (newValue) => {
    if (newValue === 'all') {
      onChange?.(null);
      return;
    }
    onChange?.(newValue ? parseInt(newValue, 10) : null);
  };

  return (
    <Select
      value={value ? String(value) : 'all'}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">כל הימים</SelectItem>
        {DAYS_OF_WEEK.map((day) => (
          <SelectItem key={day.value} value={String(day.value)}>
            {day.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
