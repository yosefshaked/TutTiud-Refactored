/* eslint-env node */

export const SYSTEM_TEMPLATES = ['INTAKE', 'ONGOING', 'SUMMARY'];

const DEFAULT_QUESTIONS = {
  INTAKE: [
    {
      id: 'intake_background',
      label: 'רקע רפואי והתפתחותי',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
    {
      id: 'intake_goals',
      label: 'מטרות ראשוניות',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
    {
      id: 'intake_assessment',
      label: 'אבחון ראשוני',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
  ],
  ONGOING: [
    {
      id: 'ongoing_focus',
      label: 'מוקדי עבודה במפגש',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
    {
      id: 'ongoing_progress',
      label: 'התקדמות ותצפיות',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
    {
      id: 'ongoing_next',
      label: 'המשך טיפול / משימות להמשך',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
  ],
  SUMMARY: [
    {
      id: 'summary_outcomes',
      label: 'סיכום תהליך ותוצאות',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
    {
      id: 'summary_recommendations',
      label: 'המלצות להמשך',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
    {
      id: 'summary_notes',
      label: 'הערות נוספות',
      type: 'textarea',
      placeholder: '',
      required: false,
      options: [],
    },
  ],
};

export function buildSystemTemplates(serviceId) {
  return [
    {
      service_id: serviceId,
      name: 'קליטה (מערכת)',
      system_type: 'INTAKE',
      structure_json: { questions: DEFAULT_QUESTIONS.INTAKE },
      display_order: 1,
      is_active: true,
      metadata: { is_system: true },
    },
    {
      service_id: serviceId,
      name: 'שוטף (מערכת)',
      system_type: 'ONGOING',
      structure_json: { questions: DEFAULT_QUESTIONS.ONGOING },
      display_order: 2,
      is_active: true,
      metadata: { is_system: true },
    },
    {
      service_id: serviceId,
      name: 'סיכום (מערכת)',
      system_type: 'SUMMARY',
      structure_json: { questions: DEFAULT_QUESTIONS.SUMMARY },
      display_order: 3,
      is_active: true,
      metadata: { is_system: true },
    },
  ];
}
