import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InfoIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

/**
 * QuestionTypePreview - Shows a preview of how a question type will appear in the form
 */
export default function QuestionTypePreview({ questionType }) {
  const getPreviewContent = () => {
    switch (questionType) {
      case 'textarea':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <Textarea rows={3} placeholder="כאן התלמיד יכול להקליד תשובה ארוכה..." disabled className="text-sm bg-white" />
            <p className="text-xs text-muted-foreground text-right">שדה טקסט חופשי מרובה שורות</p>
          </div>
        );
      
      case 'text':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <Input placeholder="כאן התלמיד יכול להקליד תשובה קצרה..." disabled className="text-sm bg-white" />
            <p className="text-xs text-muted-foreground text-right">שדה טקסט קצר בשורה אחת</p>
          </div>
        );
      
      case 'number':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <Input type="number" placeholder="0" disabled className="text-sm bg-white" />
            <p className="text-xs text-muted-foreground text-right">שדה מספרי בלבד</p>
          </div>
        );
      
      case 'date':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <Input type="date" disabled className="text-sm bg-white" />
            <p className="text-xs text-muted-foreground text-right">בוחר תאריך</p>
          </div>
        );
      
      case 'select':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <select disabled className="w-full rounded-lg border border-border bg-white p-2 text-sm">
              <option>אופציה 1</option>
              <option>אופציה 2</option>
              <option>אופציה 3</option>
            </select>
            <p className="text-xs text-muted-foreground text-right">רשימה נפתחת לבחירה</p>
          </div>
        );
      
      case 'radio':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-2 justify-end">
                <label className="text-sm">אופציה 1</label>
                <input type="radio" name="preview-radio" disabled className="cursor-not-allowed" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <label className="text-sm">אופציה 2</label>
                <input type="radio" name="preview-radio" disabled className="cursor-not-allowed" />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <label className="text-sm">אופציה 3</label>
                <input type="radio" name="preview-radio" disabled className="cursor-not-allowed" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">כפתורי בחירה עם עיגולים</p>
          </div>
        );
      
      case 'buttons':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <div className="flex flex-wrap gap-2 justify-end">
              <button type="button" disabled className="rounded-lg border-2 border-border bg-white px-4 py-2 text-sm cursor-not-allowed">
                אופציה 1
              </button>
              <button type="button" disabled className="rounded-lg border-2 border-primary bg-primary text-white px-4 py-2 text-sm cursor-not-allowed">
                אופציה 2
              </button>
              <button type="button" disabled className="rounded-lg border-2 border-border bg-white px-4 py-2 text-sm cursor-not-allowed">
                אופציה 3
              </button>
            </div>
            <p className="text-xs text-muted-foreground text-right">כפתורי בחירה מלאים (נבחר: צבע כחול)</p>
          </div>
        );
      
      case 'scale':
        return (
          <div className="space-y-2">
            <Label className="text-sm text-right block">שאלת דוגמה</Label>
            <div className="space-y-2">
              <input type="range" min="1" max="5" step="1" defaultValue="3" disabled className="w-full cursor-not-allowed" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5</span>
                <span className="font-semibold text-foreground">3</span>
                <span>1</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-right">סרגל להחלקה בין ערך מינימום למקסימום</p>
          </div>
        );
      
      default:
        return <p className="text-sm text-muted-foreground">אין תצוגה מקדימה זמינה</p>;
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-1 hover:bg-slate-100 transition-colors"
          title="הצג תצוגה מקדימה"
        >
          <InfoIcon className="h-4 w-4 text-slate-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-4" 
        align="start" 
        side="left"
        data-scroll-lock-ignore
        data-rs-scroll
      >
        <div className="space-y-2">
          <h4 className="font-semibold text-sm text-right">תצוגה מקדימה</h4>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            {getPreviewContent()}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
