import React from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown } from 'lucide-react';

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

function toLabelFromValue(v) {
  if (!v) return '';
  // incoming value shape is HH:MM:SS — show HH:MM
  return String(v).slice(0, 5);
}

function toValueFromLabel(label) {
  if (!label) return '';
  return `${label}:00`;
}

function normalizeTimeInputToLabel(input) {
  if (!input) return '';
  const s = String(input).trim();
  // If already HH:MM, validate and return
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [h, m] = s.split(':').map((t) => parseInt(t, 10));
    if (Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      // Snap minutes to nearest 15 (00, 15, 30, 45). Handle overflow.
      let snapped = Math.round(m / 15) * 15;
      let hh = h;
      if (snapped === 60) {
        if (hh === 23) {
          // Cap at the last valid slot for the day
          snapped = 45;
        } else {
          hh += 1;
          snapped = 0;
        }
      }
      return `${String(hh).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
    }
    return '';
  }
  // Digits only: H, HH, HMM, HHMM
  const digits = s.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 2) {
    const h = Math.min(parseInt(digits, 10), 23);
    if (Number.isNaN(h)) return '';
    // 00 minutes already a valid increment
    return `${String(h).padStart(2, '0')}:00`;
  }
  if (digits.length === 3) {
    const h = Math.min(parseInt(digits.slice(0, 1), 10), 23);
    const m = Math.min(parseInt(digits.slice(1), 10), 59);
    let snapped = Math.round(m / 15) * 15;
    let hh = h;
    if (snapped === 60) {
      if (hh === 23) {
        snapped = 45;
      } else {
        hh += 1;
        snapped = 0;
      }
    }
    return `${String(hh).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
  }
  // 4+ digits → take first 2 as hours, next 2 as minutes
  const h = Math.min(parseInt(digits.slice(0, 2), 10), 23);
  const m = Math.min(parseInt(digits.slice(2, 4), 10), 59);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  let snapped = Math.round(m / 15) * 15;
  let hh = h;
  if (snapped === 60) {
    if (hh === 23) {
      snapped = 45;
    } else {
      hh += 1;
      snapped = 0;
    }
  }
  return `${String(hh).padStart(2, '0')}:${String(snapped).padStart(2, '0')}`;
}

export default function TimePickerInput({ id, name, value, onChange, disabled, required, placeholder = 'בחר שעה', className }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(toLabelFromValue(value));

  // Sync displayed text when value changes from outside
  React.useEffect(() => {
    setQuery(toLabelFromValue(value));
  }, [value]);

  const displayValue = toLabelFromValue(value);

  const filtered = React.useMemo(() => {
    const q = String(query || '').toLowerCase();
    if (!q) return TIME_OPTIONS;
    return TIME_OPTIONS.filter((t) => t.label.toLowerCase().includes(q.replace(/\s/g, '')));
  }, [query]);

  const commit = (label) => {
    const lbl = normalizeTimeInputToLabel(label);
    if (!lbl) return; // do nothing on invalid
    const newValue = toValueFromLabel(lbl);
    onChange?.(newValue);
    setQuery(lbl);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(query);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <Input
            id={id}
            name={name}
            dir="ltr"
            inputMode="numeric"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            required={required}
            className={className}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? `${id || name}-time-list` : undefined}
          />
        </PopoverTrigger>
        <button
          type="button"
          aria-label="פתח רשימת שעות"
          onClick={() => setOpen((v) => !v)}
          className="absolute inset-y-0 left-2 flex items-center text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          disabled={disabled}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <PopoverContent className="p-0 w-[260px] max-h-60 overflow-auto" align="end">
        <ul id={`${id || name}-time-list`} role="listbox" className="py-1" dir="ltr">
          {filtered.map((time) => (
            <li
              key={time.value}
              role="option"
              aria-selected={displayValue === time.label}
              className="cursor-pointer select-none px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                // Prevent Input blur before we handle selection
                e.preventDefault();
              }}
              onClick={() => {
                setQuery(time.label);
                commit(time.label);
              }}
            >
              {time.label}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">לא נמצאו תוצאות</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
