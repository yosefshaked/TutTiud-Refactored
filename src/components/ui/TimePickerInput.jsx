import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function generateTimeOptions() {
  const times = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const hourStr = String(hour).padStart(2, '0');
      const minuteStr = String(minute).padStart(2, '0');
      const timeValue = `${hourStr}:${minuteStr}:00`;
      const timeLabel = `${hourStr}:${minuteStr}`;
      times.push({ value: timeValue, label: timeLabel });
    }
  }
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

export default function TimePickerInput({ value, onChange, disabled, required, placeholder = 'בחר שעה' }) {
  const handleValueChange = (newValue) => {
    onChange?.(newValue || null);
  };

  const displayValue = value ? value.substring(0, 5) : '';

  return (
    <Select
      value={value || ''}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger dir="ltr">
        <SelectValue placeholder={placeholder}>
          {displayValue || placeholder}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {TIME_OPTIONS.map((time) => (
          <SelectItem key={time.value} value={time.value} dir="ltr">
            {time.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
