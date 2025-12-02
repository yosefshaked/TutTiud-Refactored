import { Info, Download, Upload, AlertTriangle, Filter, FileText, CheckCircle, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DataMaintenanceHelpDialog({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Info className="h-6 w-6 text-primary" />
            מדריך לתחזוקת נתונים
          </DialogTitle>
          <DialogDescription className="text-right">
            הסבר מפורט על אפשרויות הייצוא והייבוא לניהול נתוני תלמידים
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6" dir="rtl">
          {/* Purpose Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="h-5 w-5 text-primary" />
                מטרת התכונה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <p className="text-sm">
                תכונת תחזוקת הנתונים נוצרה כדי לאפשר למנהלים לבצע עדכונים מהירים ומדויקים למספר תלמידים במקביל, 
                ללא צורך לערוך כל תלמיד בנפרד במערכת.
              </p>
              <p className="text-sm">
                התכונה מאפשרת ייצוא נתונים לאקסל, עריכה נוחה בממשק מוכר, וייבוא חזרה למערכת תוך אימות מלא.
              </p>
            </CardContent>
          </Card>

          {/* Original Problem Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                הבעיה המקורית
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <p className="text-sm">
                מנהלים דיווחו על קושי בעדכון נתונים עבור עשרות או מאות תלמידים:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm pr-4">
                <li>עדכון מדריכים למספר תלמידים דרש פתיחת כל פרופיל בנפרד</li>
                <li>שינוי תגיות או ימי מפגש קבוצתיים היה תהליך איטי וחוזר</li>
                <li>אימות נתונים (מספרי זהות, טלפונים) היה קשה ללא תצוגה מרוכזת</li>
                <li>זיהוי בעיות כמו מדריכים לא פעילים או התנגשויות בלוח זמנים היה ידני</li>
              </ul>
            </CardContent>
          </Card>

          {/* Export Options Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download className="h-5 w-5 text-primary" />
                אפשרויות ייצוא
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-right">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">ייצוא כל התלמידים</p>
                    <p className="text-sm text-muted-foreground">
                      מייצא את כל התלמידים לקובץ CSV. מתאים לעדכונים רחבים או ניתוח נתונים כללי.
                      הקובץ ללא עמודת "סיבת ייצוא" כי כל התלמידים מיוצאים.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">תלמידים עם בעיות</p>
                    <p className="text-sm text-muted-foreground mb-2">
                      מייצא רק תלמידים שזוהו עם בעיות הדורשות תשומת לב. עמודת "סיבת ייצוא" מציינת את הבעיה.
                    </p>
                    <p className="text-sm font-medium">בעיות מזוהות:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm pr-4 text-muted-foreground">
                      <li>חסר מספר תעודת זהות</li>
                      <li>חסר מדריך משובץ</li>
                      <li>מדריך לא פעיל (מדריך שהושבת במערכת)</li>
                      <li>התנגשות בלוח זמנים (שני תלמידים פעילים או יותר עם אותו מדריך, יום ושעה)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-2">
                      💡 שימו לב: תלמידים לא פעילים אינם נספרים כהתנגשות כי הם לא משפיעים על לוח הזמנים בפועל.
                      התנגשויות עשויות להיות מכוונות (מפגשים קבוצתיים).
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <Filter className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">ייצוא מסונן</p>
                    <p className="text-sm text-muted-foreground">
                      מאפשר ייצוא לפי קריטריונים מותאמים אישית: מדריך מסוים, יום בשבוע, או תגית.
                      עמודת "סיבת ייצוא" מציינת את הסינון שהביא לתלמיד (למשל "מדריך: יוסי כהן, יום: שני").
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Import Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Upload className="h-5 w-5 text-green-600" />
                ייבוא עדכונים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <p className="text-sm">
                אחרי עריכת הקובץ באקסל, ניתן לייבא אותו בחזרה למערכת. המערכת מזהה שינויים לפי עמודת 
                "מזהה מערכת (UUID)" ומעדכנת רק שדות ששונו.
              </p>
              <p className="text-sm font-medium">תכונות הייבוא:</p>
              <ul className="list-disc list-inside space-y-1 text-sm pr-4">
                <li>תמיכה בשמות מדריכים (לא רק UUID) - המערכת מתאימה אוטומטית</li>
                <li>אימות מספרי זהות ייחודיים - מונע כפילויות</li>
                <li>תמיכה בטקסט עברי מלא</li>
                <li>המערכת מתעלמת מעמודת "סיבת ייצוא" בייבוא</li>
                <li>הודעות שגיאה מפורטות בעברית עם מספרי שורות</li>
              </ul>
            </CardContent>
          </Card>

          {/* Expected Behavior Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                התנהגות צפויה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <p className="text-sm font-medium">תהליך עבודה מומלץ:</p>
              <ol className="list-decimal list-inside space-y-2 text-sm pr-4">
                <li>בחרו את סוג הייצוא המתאים (הכל/בעיות/מסונן)</li>
                <li>פתחו את הקובץ באקסל ובדקו שהעברית מוצגת כראוי</li>
                <li>ערכו רק את השדות הנדרשים - אל תשנו את עמודת UUID</li>
                <li>שמרו את הקובץ כ-CSV (UTF-8)</li>
                <li>ייבאו דרך "ייבוא עדכונים" - המערכת תאמת ותציג תוצאות</li>
              </ol>
              <p className="text-sm text-amber-600 font-medium mt-4">
                ⚠️ חשוב: כל שינוי מתבצע מיד במערכת. אין כפתור "בטל". אם טעיתם, תצטרכו לייצא שוב ולתקן.
              </p>
            </CardContent>
          </Card>

          {/* Restrictions Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <XCircle className="h-5 w-5 text-destructive" />
                מגבלות וזהירות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-right">
              <ul className="list-disc list-inside space-y-2 text-sm pr-4">
                <li className="text-destructive">
                  <span className="font-semibold">מקסימום 2000 שורות בייבוא</span> - קובצים גדולים יותר יידחו למניעת תקלות
                </li>
                <li>
                  <span className="font-semibold">UUID חובה</span> - אסור למחוק או לשנות את עמודת "מזהה מערכת"
                </li>
                <li>
                  <span className="font-semibold">מספרי זהות ייחודיים</span> - הייבוא ייכשל אם יש כפילויות
                </li>
                <li>
                  <span className="font-semibold">מדריכים פעילים בלבד</span> - אי אפשר לשבץ מדריך לא פעיל
                </li>
                <li>
                  <span className="font-semibold">אקסל עלול להוסיף פורמט</span> - שמרו תמיד כ-CSV, לא XLSX
                </li>
                <li>
                  <span className="font-semibold">שינויים מיידיים</span> - אין אפשרות לבטל לאחר ייבוא מוצלח
                </li>
              </ul>
              <p className="text-sm text-muted-foreground mt-4">
                💡 טיפ: לפני ייבוא גדול, נסו תחילה עם 5-10 תלמידים כדי לוודא שהפורמט תקין.
              </p>
            </CardContent>
          </Card>

          {/* Excel Tips Section */}
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-blue-900">
                <FileText className="h-5 w-5" />
                טיפים לעבודה עם אקסל
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-right">
              <ul className="list-disc list-inside space-y-1 text-sm pr-4 text-blue-900">
                <li>פתחו את הקובץ ישירות - אקסל אמור לזהות UTF-8 אוטומטית</li>
                <li>אם העברית מוצגת כסימנים מוזרים - סגרו ופתחו מחדש עם קידוד UTF-8</li>
                <li>
                  <span className="font-semibold">מספרי טלפון:</span> הקובץ המיוצא כולל נוסחת אקסל 
                  {' '}<code className="bg-white px-1 rounded">="0546341150"</code> כדי לשמור את ה-0 בהתחלה.
                  כשאתם מייבאים, אפשר להשאיר את הנוסחה כמו שהיא, או למחוק אותה ולהשאיר רק את המספר.
                </li>
                <li>
                  <span className="font-semibold text-green-700">המערכת מתקנת אוטומטית מספרי טלפון!</span>
                  {' '}אם אקסל מחק את ה-0 בהתחלה, המערכת מוסיפה אותו בחזרה אוטומטית.
                  עובד לכל סוגי המספרים: סלולר (546341150 → 0546341150), קווי (26341150 → 026341150).
                  פשוט הקלידו את המספר ללא 0 והמערכת תתקן.
                </li>
                <li>
                  <span className="font-semibold">עריכת טלפון באקסל:</span> הקלידו את המספר החדש כרגיל.
                  לא משנה אם שכחתם את ה-0 בהתחלה - המערכת מוסיפה אותו אוטומטית בעת הייבוא.
                  לא צריך להוסיף את הנוסחה {' '}<code className="bg-white px-1 rounded">="..."</code> בעצמכם.
                </li>
                <li>ימים בשבוע - השתמשו בשמות העבריים (ראשון, שני וכו') או במספרים 0-6</li>
                <li>סטטוס פעיל - השתמשו ב"כן" או "לא", לא TRUE/FALSE</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
