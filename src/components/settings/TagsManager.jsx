import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Edit2, Loader2, Plus, Tag, Trash2, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { authenticatedFetch } from '@/lib/api-client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function TagsManager() {
  const { session } = useAuth();
  const { activeOrgId } = useOrg();
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Add/Edit dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [tagName, setTagName] = useState('');
  const inputRef = useRef(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const loadTags = useCallback(async () => {
    if (!session || !activeOrgId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ keys: 'student_tags', org_id: activeOrgId });
      const response = await authenticatedFetch(`settings?${params.toString()}`, { session });
      const settingsValue = response?.settings?.student_tags;
      setTags(Array.isArray(settingsValue) ? settingsValue : []);
    } catch (err) {
      console.error('Failed to load tags', err);
      setError('טעינת התגיות נכשלה.');
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, [session, activeOrgId]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const openAddDialog = () => {
    setEditingTag(null);
    setTagName('');
    setActionError('');
    setIsDialogOpen(true);
  };

  const openEditDialog = (tag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setActionError('');
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    if (!actionLoading) {
      setIsDialogOpen(false);
      setEditingTag(null);
      setTagName('');
      setActionError('');
    }
  };

  // Auto-focus the input when the dialog opens
  useEffect(() => {
    if (isDialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isDialogOpen]);

  const handleSaveTag = async (e) => {
    e.preventDefault();
    const trimmedName = tagName.trim();
    if (!trimmedName) {
      setActionError('יש להזין שם תגית.');
      return;
    }

    // Check for duplicate names (excluding current tag when editing)
    const duplicate = tags.find(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== editingTag?.id
    );
    if (duplicate) {
      setActionError('תגית בשם זה כבר קיימת.');
      return;
    }

    setActionLoading(true);
    setActionError('');

    try {
      if (editingTag) {
        // Update existing tag
        const updatedTags = tags.map((t) => (t.id === editingTag.id ? { ...t, name: trimmedName } : t));
        await authenticatedFetch('settings', { 
          method: 'POST', 
          body: { 
            org_id: activeOrgId,
            settings: {
              student_tags: updatedTags
            }
          }, 
          session 
        });
        setTags(updatedTags);
      } else {
        // Create new tag
        const body = { org_id: activeOrgId, name: trimmedName };
        const response = await authenticatedFetch('settings/student-tags', { method: 'POST', body, session });
        const newTag = response?.created;
        if (newTag) {
          setTags((prev) => [...prev, newTag]);
        } else {
          // Fallback: reload all tags
          await loadTags();
        }
      }
      closeDialog();
    } catch (err) {
      console.error('Failed to save tag', err);
      setActionError(err?.message || 'שמירת התגית נכשלה.');
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteDialog = (tag) => {
    setTagToDelete(tag);
    setDeleteError('');
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (!actionLoading) {
      setDeleteDialogOpen(false);
      setTagToDelete(null);
      setDeleteError('');
    }
  };

  const handleDeleteTag = async () => {
    if (!tagToDelete) return;

    setActionLoading(true);
    setDeleteError('');
    try {
      // First remove tag from all students who have it
      await authenticatedFetch('students-remove-tag', {
        method: 'POST',
        body: { org_id: activeOrgId, tag_id: tagToDelete.id },
        session,
      });

      // Then remove tag from catalog
      const updatedTags = tags.filter((t) => t.id !== tagToDelete.id);
      await authenticatedFetch('settings', { 
        method: 'POST', 
        body: { 
          org_id: activeOrgId,
          settings: {
            student_tags: updatedTags
          }
        }, 
        session 
      });

      setTags(updatedTags);
      closeDeleteDialog();
    } catch (err) {
      console.error('Failed to delete tag', err);
      setDeleteError(err?.message || 'מחיקת התגית נכשלה.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            ניהול תגיות
          </CardTitle>
          <CardDescription>ניהול תגיות לסיווג ותיוג תלמידים</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>טוען תגיות...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-row-reverse items-center justify-between gap-4">
            <div className="flex-1 text-right">
              <CardTitle className="flex items-center gap-2 justify-end mb-1">
                <span>ניהול תגיות</span>
                <Tag className="h-5 w-5" />
              </CardTitle>
              <CardDescription className="text-right">ניהול תגיות לסיווג ותיוג תלמידים</CardDescription>
            </div>
            <Button onClick={openAddDialog} size="sm" className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              תגית חדשה
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2" role="alert" dir="rtl">
              <span className="flex-1 text-right">{error}</span>
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            </div>
          )}

          {tags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">לא קיימות תגיות. צור תגית ראשונה כדי להתחיל.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="group flex items-center justify-between p-3 rounded-lg border bg-card/90 hover:bg-accent/40 transition-colors focus-within:ring-2 focus-within:ring-primary/30"
                  dir="rtl"
                >
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium select-text">{tag.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(tag)}
                      className="h-8 px-2"
                      title="עריכת תגית"
                      aria-label={`עריכת תגית ${tag.name}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDeleteDialog(tag)}
                      className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="מחיקת תגית"
                      aria-label={`מחיקת תגית ${tag.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTag ? 'עריכת תגית' : 'תגית חדשה'}</DialogTitle>
            <DialogDescription>
              {editingTag ? 'ערוך את שם התגית. השינוי יחול על כל התלמידים המתויגים.' : 'צור תגית חדשה לסיווג תלמידים.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTag} className="space-y-4" dir="rtl">
            <div className="space-y-2">
              <Label htmlFor="tag-name" className="text-right block">
                שם תגית
              </Label>
              <Input
                id="tag-name"
                ref={inputRef}
                value={tagName}
                onChange={(e) => setTagName(e.target.value)}
                placeholder="לדוגמה: תלמיד חדש"
                required
                disabled={actionLoading}
                dir="rtl"
                className="text-right"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveTag(e);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground text-right">השם יוצג בתפריטים ושדות בחירת תגיות.</p>
            </div>

            {actionError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 text-right flex items-start gap-2" role="alert">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
          </form>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button type="submit" onClick={handleSaveTag} disabled={actionLoading} className="gap-2">
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingTag ? 'שמירת שינויים' : 'יצירת תגית'}
            </Button>
            <Button type="button" variant="outline" onClick={closeDialog} disabled={actionLoading}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={closeDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">האם למחוק את התגית "{tagToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              פעולה זו תמחק את התגית מהמערכת ותסיר אותה מכל התלמידים שמתויגים בה. לא ניתן לשחזר את הפעולה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {deleteError && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 text-right flex items-start gap-2" role="alert">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}
          
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={handleDeleteTag}
              disabled={actionLoading}
              className="bg-destructive hover:bg-destructive/90 gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              מחיקת תגית
            </AlertDialogAction>
            <AlertDialogCancel disabled={actionLoading}>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
