import { Info, Download, Upload, AlertTriangle, Filter, FileText, CheckCircle, XCircle, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useState } from 'react';

export function DataMaintenanceHelpDialog({ open, onClose }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Info className="h-6 w-6 text-primary" />
            מדריך תחזוקת נתונים
          </DialogTitle>
          <DialogDescription className="text-right">
            עדכנו מספר תלמידים במקביל באמצעות אקסל
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" dir="rtl">
          {/* Quick Start */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-5 w-5 text-primary" />
                התחלה מהירה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-right">
              <ol className="list-decimal list-inside space-y-1.5 text-sm pr-4">
                <li><strong>ייצאו</strong> - בחרו "ייצוא כל התלמידים" או סינון מסוים</li>
                <li><strong>ערכו באקסל</strong> - פתחו הקובץ ושנו מה שצריך (אל תגעו בעמודת UUID)</li>
                <li><strong>שמרו כ-CSV</strong> - File → Save As → CSV (UTF-8)</li>
                <li><strong>ייבאו</strong> - בחרו "ייבוא עדכונים" והעלו את הקובץ</li>
              </ol>
              <p className="text-xs text-amber-600 font-medium mt-3 pr-4">
                ⚠️ שינויים מיידיים - אין "בטל". נסו עם 5-10 תלמידים לפני ייבוא גדול.
              </p>
            </CardContent>
          </Card>

          {/* Export Options Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Download className="h-5 w-5 text-primary" />
                אפשרויות ייצוא
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right text-sm">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <strong>ייצוא כל התלמידים</strong> - לעדכונים רחבים
                </div>
              </div>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <strong>תלמידים עם בעיות</strong> - חסר מזהה, מדריך לא פעיל, או התנגשויות בלוח זמנים
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Filter className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <strong>ייצוא מסונן</strong> - לפי מדריך, יום, או תגית
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                💡 הקובץ כולל עמודת "סיבת ייצוא" (חוץ מ"ייצוא הכל") המסבירה למה כל תלמיד נכלל
              </p>
            </CardContent>
          </Card>

          {/* Excel Tips - Most Important */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-blue-900">
                <FileText className="h-5 w-5" />
                טיפים חשובים לאקסל
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-right">
              <ul className="list-disc list-inside space-y-1.5 text-sm pr-4 text-blue-900">
                <li>
                  <strong className="text-green-700">מספרי טלפון מתוקנים אוטומטית!</strong>
                  {' '}אפשר למחוק את הנוסחה {' '}<code className="bg-white px-1 rounded">="0546341150"</code> ולהקליד את המספר רגיל.
                  עם 0 או בלי 0 - המערכת מוסיפה אותו אוטומטית (546341150 → 0546341150).
                </li>
                <li><strong>אל תשנו את עמודת UUID</strong> - זה המזהה שמחבר לתלמיד במערכת</li>
                <li><strong>שמרו תמיד כ-CSV</strong>, לא XLSX! File → Save As → CSV (UTF-8)</li>
                <li><strong>שמות מדריכים עובדים</strong> - לא צריך UUID, פשוט שם המדריך. <span className="text-amber-700">מדריכים לא פעילים יידחו.</span></li>
                <li><strong>ימים בשבוע:</strong> השתמשו בשמות העבריים (ראשון, שני, שלישי וכו')</li>
                <li><strong>סטטוס פעיל:</strong> השתמשו ב"כן" או "לא" (לא TRUE/FALSE)</li>
              </ul>
            </CardContent>
          </Card>

          {/* Restrictions */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-amber-900">
                <XCircle className="h-5 w-5" />
                מגבלות חשובות
              </CardTitle>
            </CardHeader>
            <CardContent className="text-right">
              <ul className="list-disc list-inside space-y-1 text-sm pr-4 text-amber-900">
                <li><strong>מקסימום 2000 שורות</strong> בייבוא אחד</li>
                <li><strong>שינויים מיידיים</strong> - אין אפשרות לבטל</li>
                <li><strong>מספרי זהות ייחודיים</strong> - כפילויות נחסמות</li>
                <li><strong>מדריכים לא פעילים</strong> - לא ניתן לשבץ מדריך שהושבת במערכת</li>
                <li><strong>רק קובצי CSV</strong> - קובצי XLSX לא נתמכים, שמרו כ-CSV בלבד</li>
              </ul>
            </CardContent>
          </Card>

          {/* Advanced Details - Collapsible */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <Card className="border-muted">
              <CollapsibleTrigger className="w-full">
                <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-muted-foreground" />
                      פרטים נוספים ורקע
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {showAdvanced ? '▲ הסתר' : '▼ הצג'}
                    </span>
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="space-y-4 text-right pt-0">
                  <div>
                    <p className="font-semibold text-sm mb-1">למה נוצרה התכונה?</p>
                    <p className="text-sm text-muted-foreground">
                      מנהלים דיווחו שעדכון מדריכים, תגיות, וימי מפגש לעשרות תלמידים דרש פתיחת כל פרופיל בנפרד. 
                      אימות נתונים (מזהים, טלפונים) וזיהוי בעיות (מדריכים לא פעילים, התנגשויות) היה ידני וקשה.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">תלמידים עם בעיות - מה מזוהה?</p>
                    <ul className="list-disc list-inside space-y-0.5 text-sm pr-4 text-muted-foreground">
                      <li>חסר מספר תעודת זהות</li>
                      <li>חסר מדריך משובץ או מדריך לא פעיל</li>
                      <li>התנגשות בלוח זמנים (2+ תלמידים פעילים, אותו מדריך/יום/שעה)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 תלמידים לא פעילים לא נספרים כהתנגשות. התנגשויות עשויות להיות מכוונות (קבוצות).
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-sm mb-1">תכונות ייבוא מתקדמות</p>
                    <ul className="list-disc list-inside space-y-0.5 text-sm pr-4 text-muted-foreground">
                      <li>המערכת מזהה רק שדות ששונו ומעדכנת אותם בלבד</li>
                      <li>תמיכה מלאה בעברית (UTF-8)</li>
                      <li>הודעות שגיאה בעברית עם מספרי שורות מדויקים</li>
                      <li>עמודת "סיבת ייצוא" מתעלמת בייבוא (לא משפיעה)</li>
                    </ul>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}
