export function parseSessionFormConfig(settingsValue) {
  if (!settingsValue) {
    return [];
  }

  let payload = settingsValue;
  if (typeof settingsValue === 'string') {
    const trimmed = settingsValue.trim();
    if (!trimmed) {
      return [];
    }
    try {
      payload = JSON.parse(trimmed);
    } catch {
      return [
        {
          key: 'question_1',
          label: trimmed,
          type: 'textarea',
        },
      ];
    }
  }

  if (Array.isArray(payload)) {
    return payload.map((entry, index) => normalizeQuestion(entry, index));
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.questions)) {
    return payload.questions.map((entry, index) => normalizeQuestion(entry, index));
  }

  return [];
}

export function ensureSessionFormFallback(questions) {
  if (Array.isArray(questions) && questions.length) {
    return questions;
  }

  return [
    {
      key: 'session_summary',
      label: 'תיאור המפגש',
      type: 'textarea',
      placeholder: 'תארו בקצרה את מהלך המפגש',
    },
    {
      key: 'next_steps',
      label: 'משימות להמשך',
      type: 'textarea',
      placeholder: 'משימות או הערות להמשך התקדמות',
    },
  ];
}

function normalizeQuestion(entry, index) {
  if (!entry) {
    return {
      key: `question_${index + 1}`,
      label: `שאלה ${index + 1}`,
      type: 'textarea',
    };
  }

  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return {
      key: trimmed ? createQuestionKey(trimmed, index) : `question_${index + 1}`,
      label: trimmed || `שאלה ${index + 1}`,
      type: 'textarea',
    };
  }

  const label = typeof entry.label === 'string' && entry.label.trim()
    ? entry.label.trim()
    : typeof entry.title === 'string' && entry.title.trim()
      ? entry.title.trim()
      : typeof entry.question === 'string' && entry.question.trim()
        ? entry.question.trim()
        : `שאלה ${index + 1}`;

  const type = typeof entry.type === 'string' ? entry.type : 'textarea';

  let key = typeof entry.key === 'string' && entry.key.trim()
    ? entry.key.trim()
    : typeof entry.id === 'string' && entry.id.trim()
      ? entry.id.trim()
      : createQuestionKey(label, index);

  key = key.replace(/\s+/g, '_');

  return {
    key,
    label,
    type: type === 'text' || type === 'textarea' ? type : 'textarea',
    placeholder: typeof entry.placeholder === 'string' ? entry.placeholder : '',
  };
}

function createQuestionKey(label, index) {
  const normalized = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9א-ת]+/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '');
  return normalized || `question_${index + 1}`;
}
