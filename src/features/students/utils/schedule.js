import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export const DAY_NAMES = Object.freeze({
  1: 'יום ראשון',
  2: 'יום שני',
  3: 'יום שלישי',
  4: 'יום רביעי',
  5: 'יום חמישי',
  6: 'יום שישי',
  7: 'יום שבת',
});

export function formatDefaultTime(value) {
  if (!value) {
    return '';
  }

  try {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return format(date, 'HH:mm', { locale: he });
    }
  } catch {
    // ignore parsing errors and fall back to string
  }

  if (typeof value === 'string') {
    return value.slice(0, 5);
  }

  return '';
}

export function describeSchedule(dayOfWeek, timeValue) {
  const dayLabel = DAY_NAMES[dayOfWeek] || 'יום לא מוגדר';
  const timeLabel = formatDefaultTime(timeValue);
  if (timeLabel) {
    return `${dayLabel} • ${timeLabel}`;
  }
  return dayLabel;
}
