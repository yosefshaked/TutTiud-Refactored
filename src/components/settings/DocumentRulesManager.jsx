import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { FileText, Plus, Trash2, Pencil, Loader2, AlertCircle } from 'lucide-react';
import { fetchSettingsValue, upsertSettings } from '@/features/settings/api/settings.js';

const REQUEST_STATE = {
  idle: 'idle',
  loading: 'loading',
  error: 'error',
};

function generateId() {
  return crypto.randomUUID();
}

export default function DocumentRulesManager({ session, orgId }) {
  const [loadState, setLoadState] = useState(REQUEST_STATE.idle);
  const [saveState, setSaveState] = useState(REQUEST_STATE.idle);
  const [definitions, setDefinitions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', is_mandatory: false, target_tags: [] });

  const canAct = Boolean(session && orgId);

  // Load document definitions
  useEffect(() => {
    if (!canAct) return;

    const loadDefinitions = async () => {
      setLoadState(REQUEST_STATE.loading);
      try {
        const { value } = await fetchSettingsValue({
          session,
          orgId,
          key: 'document_definitions',
        });

        const parsed = Array.isArray(value) ? value : [];
        setDefinitions(parsed);
        setLoadState(REQUEST_STATE.idle);
      } catch (error) {
        console.error('Error loading document definitions:', error);
        setLoadState(REQUEST_STATE.error);
        toast.error('טעינת הגדרות מסמכים נכשלה');
      }
    };

    loadDefinitions();
  }, [canAct, session, orgId]);

  const handleSave = useCallback(async () => {
    if (!canAct) return;

    setSaveState(REQUEST_STATE.loading);

    try {
      await upsertSettings({
        session,
        orgId,
        settings: {
          document_definitions: definitions,
        },
      });

      toast.success('הגדרות המסמכים נשמרו בהצלחה!');
      setSaveState(REQUEST_STATE.idle);
    } catch (error) {
      console.error('Save document definitions failed', error);
      toast.error(error?.message || 'שמירת הגדרות המסמכים נכשלה');
      setSaveState(REQUEST_STATE.error);
    }
  }, [canAct, session, orgId, definitions]);

  const handleAdd = useCallback(() => {
    const newDef = {
      id: generateId(),
      name: 'מסמך חדש',
      is_mandatory: false,
      target_tags: [],
    };
    setDefinitions((prev) => [...prev, newDef]);
    setEditingId(newDef.id);
    setEditForm({ name: newDef.name, is_mandatory: newDef.is_mandatory, target_tags: newDef.target_tags });
  }, []);

  const handleEdit = useCallback((def) => {
    setEditingId(def.id);
    setEditForm({ name: def.name, is_mandatory: def.is_mandatory, target_tags: def.target_tags });
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editForm.name.trim()) {
      toast.error('יש להזין שם למסמך');
      return;
    }

    setDefinitions((prev) =>
      prev.map((d) =>
        d.id === editingId
          ? { ...d, name: editForm.name.trim(), is_mandatory: editForm.is_mandatory, target_tags: editForm.target_tags }
          : d
      )
    );
    setEditingId(null);
    setEditForm({ name: '', is_mandatory: false, target_tags: [] });
  }, [editingId, editForm]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({ name: '', is_mandatory: false, target_tags: [] });
  }, []);

  const handleDelete = useCallback((id) => {
    if (!confirm('האם למחוק מסמך זה? פעולה זו אינה ניתנת לביטול.')) return;
    setDefinitions((prev) => prev.filter((d) => d.id !== id));
  }, []);

  if (loadState === REQUEST_STATE.loading) {
    return (
      <Card dir="rtl">
        <CardContent className="p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600">טוען הגדרות מסמכים...</p>
        </CardContent>
      </Card>
    );
  }

  if (loadState === REQUEST_STATE.error) {
    return (
      <Card dir="rtl">
        <CardContent className="p-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm text-red-600">שגיאה בטעינת הגדרות המסמכים</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          הגדרות מסמכים נדרשים
        </CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          הגדרת רשימת מסמכים תקניים ומחויבים עבור תלמידי הארגון
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Definitions List */}
        {definitions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>לא הוגדרו מסמכים עדיין</p>
            <p className="text-sm">לחץ על "הוסף מסמך" כדי להתחיל</p>
          </div>
        ) : (
          <div className="space-y-3">
            {definitions.map((def) => (
              <div
                key={def.id}
                className={`p-4 border rounded-lg ${
                  editingId === def.id ? 'border-primary bg-primary/5' : 'border-slate-200'
                }`}
              >
                {editingId === def.id ? (
                  // Edit Mode
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor={`name-${def.id}`}>שם המסמך</Label>
                      <Input
                        id={`name-${def.id}`}
                        value={editForm.name}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="לדוגמה: אישור רפואי"
                        className="mt-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`mandatory-${def.id}`}
                        checked={editForm.is_mandatory}
                        onCheckedChange={(checked) => setEditForm((prev) => ({ ...prev, is_mandatory: checked }))}
                      />
                      <Label htmlFor={`mandatory-${def.id}`}>מסמך חובה</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit}>
                        שמור
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        ביטול
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-semibold">{def.name}</div>
                      <div className="flex gap-2 mt-1">
                        {def.is_mandatory && (
                          <Badge variant="destructive" className="text-xs">
                            חובה
                          </Badge>
                        )}
                        {!def.is_mandatory && (
                          <Badge variant="secondary" className="text-xs">
                            אופציונלי
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(def)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(def.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Button */}
        <Button onClick={handleAdd} variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          הוסף מסמך
        </Button>

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={handleSave} disabled={saveState === REQUEST_STATE.loading} className="gap-2">
            {saveState === REQUEST_STATE.loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                שמירת הגדרות
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
