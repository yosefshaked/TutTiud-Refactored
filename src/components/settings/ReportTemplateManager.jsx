import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Save, Trash2, RefreshCw, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/api-client.js';
import { useServiceCatalog } from '@/hooks/useOrgData.js';

const QUESTION_TYPE_OPTIONS = [
  { value: 'textarea', label: 'טקסט חופשי (פסקה)' },
  { value: 'text', label: 'טקסט קצר' },
  { value: 'number', label: 'מספר' },
  { value: 'date', label: 'תאריך' },
  { value: 'select', label: 'בחירה מרשימה' },
  { value: 'radio', label: 'כפתורי בחירה' },
  { value: 'buttons', label: 'בחירה באמצעות כפתורים' },
  { value: 'scale', label: 'סולם הערכה (טווח מספרי)' },
];

const OPTION_TYPES = new Set(['select', 'radio', 'buttons']);
const RANGE_TYPES = new Set(['scale']);
const DEFAULT_RANGE = Object.freeze({ min: 1, max: 5, step: 1 });

function generateId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyQuestion(index = 0) {
  return {
    id: generateId('question'),
    label: `שאלה ${index + 1}`,
    type: 'textarea',
    placeholder: '',
    required: false,
    options: [],
    range: { ...DEFAULT_RANGE },
  };
}

function createEmptyOption() {
  return {
    id: generateId('option'),
    label: '',
    value: '',
  };
}

function extractQuestions(structureJson) {
  if (!structureJson || typeof structureJson !== 'object') return [];
  const raw = structureJson.questions;
  return Array.isArray(raw) ? raw : [];
}

function normalizeQuestionsForSave(questions) {
  return questions.map((question, index) => {
    const base = {
      id: question.id || generateId('question'),
      label: typeof question.label === 'string' && question.label.trim()
        ? question.label.trim()
        : `שאלה ${index + 1}`,
      type: question.type || 'textarea',
      placeholder: question.placeholder || '',
      required: Boolean(question.required),
    };

    if (OPTION_TYPES.has(base.type)) {
      const options = Array.isArray(question.options) ? question.options : [];
      base.options = options
        .map((option) => ({
          id: option.id || generateId('option'),
          label: (option.label || '').trim(),
          value: (option.value || '').trim(),
        }))
        .filter((option) => option.label && option.value);
    } else if (RANGE_TYPES.has(base.type)) {
      base.range = {
        min: Number(question.range?.min ?? DEFAULT_RANGE.min),
        max: Number(question.range?.max ?? DEFAULT_RANGE.max),
        step: Number(question.range?.step ?? DEFAULT_RANGE.step),
      };
    }

    return base;
  });
}

export default function ReportTemplateManager({ session, orgId }) {
  const { serviceCatalog, loadingServiceCatalog, serviceCatalogError } = useServiceCatalog({
    enabled: Boolean(session && orgId),
    orgId,
  });
  const [serviceError, setServiceError] = useState('');

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [creatingSystem, setCreatingSystem] = useState(false);
  const [creatingCustom, setCreatingCustom] = useState(false);

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => template.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const systemTemplates = useMemo(() => {
    return templates.filter((template) => template?.metadata?.is_system);
  }, [templates]);

  const customTemplates = useMemo(() => {
    return templates.filter((template) => !template?.metadata?.is_system);
  }, [templates]);

  const loadTemplates = useCallback(async (serviceId) => {
    if (!session || !orgId || !serviceId) {
      setTemplates([]);
      return;
    }

    setTemplatesLoading(true);
    try {
      const response = await authenticatedFetch('report-templates', {
        session,
        params: {
          org_id: orgId,
          service_id: serviceId,
        },
      });
      setTemplates(Array.isArray(response?.templates) ? response.templates : []);
    } catch (error) {
      console.error('Failed to load templates', error);
      toast.error('טעינת התבניות נכשלה');
    } finally {
      setTemplatesLoading(false);
    }
  }, [orgId, session]);

  useEffect(() => {
    if (serviceCatalogError) {
      if (serviceCatalogError.includes('services_table_missing')) {
        setServiceError('נדרש להריץ את עדכון המערכת כדי ליצור טבלת שירותים.');
        return;
      }
      setServiceError(serviceCatalogError);
      return;
    }
    setServiceError('');
  }, [serviceCatalogError, selectedServiceId]);

  useEffect(() => {
    if (!selectedServiceId) {
      setTemplates([]);
      setSelectedTemplateId('');
      setQuestions([]);
      return;
    }
    void loadTemplates(selectedServiceId);
  }, [loadTemplates, selectedServiceId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateName('');
      setQuestions([]);
      return;
    }
    setTemplateName(selectedTemplate.name || '');
    setQuestions(extractQuestions(selectedTemplate.structure_json));
  }, [selectedTemplate]);

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createEmptyQuestion(prev.length)]);
  };

  const handleRemoveQuestion = (index) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleQuestionChange = (index, updates) => {
    setQuestions((prev) => prev.map((q, idx) => (idx === index ? { ...q, ...updates } : q)));
  };

  const handleOptionChange = (questionIndex, optionIndex, updates) => {
    setQuestions((prev) => prev.map((q, idx) => {
      if (idx !== questionIndex) return q;
      const nextOptions = Array.isArray(q.options) ? q.options.map((opt, optIdx) => {
        if (optIdx !== optionIndex) return opt;
        return { ...opt, ...updates };
      }) : [];
      return { ...q, options: nextOptions };
    }));
  };

  const handleAddOption = (questionIndex) => {
    setQuestions((prev) => prev.map((q, idx) => {
      if (idx !== questionIndex) return q;
      const nextOptions = Array.isArray(q.options) ? [...q.options, createEmptyOption()] : [createEmptyOption()];
      return { ...q, options: nextOptions };
    }));
  };

  const handleRemoveOption = (questionIndex, optionIndex) => {
    setQuestions((prev) => prev.map((q, idx) => {
      if (idx !== questionIndex) return q;
      const nextOptions = Array.isArray(q.options) ? q.options.filter((_, optIdx) => optIdx !== optionIndex) : [];
      return { ...q, options: nextOptions };
    }));
  };

  const callTemplateWrite = async (payload, method) => {
    try {
      return await authenticatedFetch('report-templates', {
        session,
        method,
        body: payload,
      });
    } catch (error) {
      if (error?.status !== 404) {
        throw error;
      }
      return authenticatedFetch('report-templates-action', {
        session,
        method,
        body: payload,
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate || !session) return;

    setSaving(true);
    try {
      await callTemplateWrite({
        org_id: orgId,
        id: selectedTemplate.id,
        name: templateName,
        structure_json: { questions: normalizeQuestionsForSave(questions) },
      }, 'PUT');
      toast.success('התבנית נשמרה בהצלחה');
      await loadTemplates(selectedServiceId);
    } catch (error) {
      console.error('Failed to save template', error);
      toast.error('שמירת התבנית נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSystemTemplates = async () => {
    if (!session || !selectedServiceId) return;
    setCreatingSystem(true);
    try {
      await callTemplateWrite({
        org_id: orgId,
        service_id: selectedServiceId,
        action: 'ensure_system',
      }, 'POST');
      toast.success('תבניות מערכת נוצרו');
      await loadTemplates(selectedServiceId);
    } catch (error) {
      console.error('Failed to create system templates', error);
      toast.error('יצירת תבניות מערכת נכשלה');
    } finally {
      setCreatingSystem(false);
    }
  };

  const handleCreateCustomFromBase = async (baseTemplate) => {
    if (!session || !selectedServiceId || !baseTemplate) return;
    setCreatingCustom(true);
    try {
      const response = await callTemplateWrite({
        org_id: orgId,
        service_id: selectedServiceId,
        action: 'create_custom',
        base_template_id: baseTemplate.id,
        system_type: baseTemplate.system_type,
        name: `תבנית מותאמת - ${baseTemplate.name}`,
      }, 'POST');
      toast.success('תבנית מותאמת נוצרה');
      await loadTemplates(selectedServiceId);
      if (response?.template?.id) {
        setSelectedTemplateId(response.template.id);
      }
    } catch (error) {
      console.error('Failed to create custom template', error);
      toast.error('יצירת תבנית מותאמת נכשלה');
    } finally {
      setCreatingCustom(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate || !session) return;
    if (selectedTemplate?.metadata?.is_system) {
      toast.error('לא ניתן למחוק תבניות מערכת');
      return;
    }

    setSaving(true);
    try {
      await callTemplateWrite({
        org_id: orgId,
        id: selectedTemplate.id,
      }, 'DELETE');
      toast.success('התבנית נמחקה');
      setSelectedTemplateId('');
      await loadTemplates(selectedServiceId);
    } catch (error) {
      console.error('Failed to delete template', error);
      toast.error('מחיקת התבנית נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full border-0 shadow-lg bg-white/80">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg">תבניות דיווח</CardTitle>
        <p className="text-xs text-slate-600 mt-xs sm:mt-sm sm:text-sm">
          בחרו שירות כדי לנהל את תבניות הדיווח (קליטה, שוטף, סיכום ותבניות מותאמות).
        </p>
      </CardHeader>
      <CardContent className="space-y-md">
        <div className="space-y-xs">
          <Label className="text-xs sm:text-sm">בחרו שירות *</Label>
          {loadingServiceCatalog ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              טוען שירותים...
            </div>
          ) : (
            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="בחרו שירות" />
              </SelectTrigger>
              <SelectContent>
                {serviceCatalog.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {serviceError && (
            <p className="text-xs text-red-600">{serviceError}</p>
          )}
        </div>

        {selectedServiceId && (
          <div className="space-y-md">
            <div className="flex flex-wrap items-center gap-sm">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => loadTemplates(selectedServiceId)}
                disabled={templatesLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${templatesLoading ? 'animate-spin' : ''}`} />
                רענון תבניות
              </Button>
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={handleCreateSystemTemplates}
                disabled={creatingSystem}
                className="gap-2"
              >
                {creatingSystem ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                צור תבניות מערכת
              </Button>
            </div>

            {templatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                טוען תבניות...
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-slate-500">אין תבניות לשירות זה.</p>
            ) : (
              <div className="grid gap-md md:grid-cols-[1fr,2fr]">
                <div className="space-y-sm">
                  <h4 className="text-sm font-semibold text-slate-700">תבניות קיימות</h4>
                  <div className="space-y-xs">
                    {systemTemplates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <button
                          type="button"
                          className="text-sm text-right flex-1"
                          onClick={() => setSelectedTemplateId(template.id)}
                        >
                          {template.name}
                        </button>
                        <Badge variant="secondary" className="text-xs">מערכת</Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={creatingCustom}
                          onClick={() => handleCreateCustomFromBase(template)}
                        >
                          צור מותאם
                        </Button>
                      </div>
                    ))}
                    {customTemplates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                        <button
                          type="button"
                          className="text-sm text-right flex-1"
                          onClick={() => setSelectedTemplateId(template.id)}
                        >
                          {template.name}
                        </button>
                        <Badge variant="outline" className="text-xs">
                          {template.system_type === 'CUSTOM' ? 'מותאם' : `מותאם • ${template.system_type}`}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-sm">
                  {selectedTemplate ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-xs">
                          <Label className="text-xs">שם תבנית</Label>
                          <Input
                            value={templateName}
                            onChange={(event) => setTemplateName(event.target.value)}
                            disabled={saving}
                          />
                        </div>
                        {selectedTemplate?.metadata?.is_system && (
                          <Badge variant="secondary" className="text-xs">מערכת</Badge>
                        )}
                      </div>

                      <div className="space-y-sm">
                        {questions.map((question, index) => (
                          <div key={question.id} className="rounded-md border p-sm space-y-sm">
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs">שאלה {index + 1}</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveQuestion(index)}
                                disabled={saving}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                            <Input
                              value={question.label || ''}
                              onChange={(event) => handleQuestionChange(index, { label: event.target.value })}
                              placeholder="טקסט השאלה"
                              disabled={saving}
                            />
                            <div className="grid gap-sm sm:grid-cols-2">
                              <div className="space-y-xs">
                                <Label className="text-xs">סוג שאלה</Label>
                                <Select
                                  value={question.type}
                                  onValueChange={(value) => handleQuestionChange(index, { type: value })}
                                  disabled={saving}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="בחרו סוג" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {QUESTION_TYPE_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-xs">
                                <Label className="text-xs">שדה חובה</Label>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={Boolean(question.required)}
                                    onCheckedChange={(value) => handleQuestionChange(index, { required: value })}
                                    disabled={saving}
                                  />
                                  <span className="text-xs text-slate-600">חובה</span>
                                </div>
                              </div>
                            </div>

                            {OPTION_TYPES.has(question.type) && (
                              <div className="space-y-xs">
                                <Label className="text-xs">אפשרויות</Label>
                                <div className="space-y-xs">
                                  {(question.options || []).map((option, optionIndex) => (
                                    <div key={option.id || optionIndex} className="flex items-center gap-2">
                                      <Input
                                        value={option.label || ''}
                                        onChange={(event) => handleOptionChange(index, optionIndex, { label: event.target.value })}
                                        placeholder="תווית"
                                        disabled={saving}
                                      />
                                      <Input
                                        value={option.value || ''}
                                        onChange={(event) => handleOptionChange(index, optionIndex, { value: event.target.value })}
                                        placeholder="ערך"
                                        disabled={saving}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveOption(index, optionIndex)}
                                        disabled={saving}
                                        className="text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleAddOption(index)}
                                    disabled={saving}
                                    className="gap-2"
                                  >
                                    <Plus className="h-4 w-4" />
                                    הוסף אפשרות
                                  </Button>
                                </div>
                              </div>
                            )}

                            {RANGE_TYPES.has(question.type) && (
                              <div className="grid gap-sm sm:grid-cols-3">
                                <div className="space-y-xs">
                                  <Label className="text-xs">מינימום</Label>
                                  <Input
                                    type="number"
                                    value={question.range?.min ?? DEFAULT_RANGE.min}
                                    onChange={(event) => handleQuestionChange(index, { range: { ...question.range, min: Number(event.target.value) } })}
                                    disabled={saving}
                                  />
                                </div>
                                <div className="space-y-xs">
                                  <Label className="text-xs">מקסימום</Label>
                                  <Input
                                    type="number"
                                    value={question.range?.max ?? DEFAULT_RANGE.max}
                                    onChange={(event) => handleQuestionChange(index, { range: { ...question.range, max: Number(event.target.value) } })}
                                    disabled={saving}
                                  />
                                </div>
                                <div className="space-y-xs">
                                  <Label className="text-xs">קפיצה</Label>
                                  <Input
                                    type="number"
                                    value={question.range?.step ?? DEFAULT_RANGE.step}
                                    onChange={(event) => handleQuestionChange(index, { range: { ...question.range, step: Number(event.target.value) } })}
                                    disabled={saving}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-sm">
                        <Button type="button" variant="outline" onClick={handleAddQuestion} disabled={saving} className="gap-2">
                          <Plus className="h-4 w-4" />
                          הוסף שאלה
                        </Button>
                        <Button type="button" onClick={handleSaveTemplate} disabled={saving} className="gap-2">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          שמור תבנית
                        </Button>
                        {!selectedTemplate?.metadata?.is_system && (
                          <Button type="button" variant="destructive" onClick={handleDeleteTemplate} disabled={saving} className="gap-2">
                            <Trash2 className="h-4 w-4" />
                            מחק תבנית
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">בחרו תבנית כדי לערוך את השאלות.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
