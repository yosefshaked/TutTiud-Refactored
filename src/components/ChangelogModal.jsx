import React, { useEffect } from 'react';

export default function ChangelogModal({ open, onClose }) {
  // סגירה עם ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-title"
      onClick={(e) => {
        // סגירה בלחיצה מחוץ לקופסה
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(2,6,23,0.25)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 10px 30px rgba(2,6,23,0.2)',
          width: 'min(90vw, 860px)',
          height: 'min(85vh, 640px)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            background: 'transparent',
            border: 'none',
            fontSize: 22,
            color: '#64748b',
            cursor: 'pointer',
            zIndex: 10001,
          }}
          aria-label="סגור עדכונים"
        >
          ×
        </button>

        <h2
          id="changelog-title"
          style={{ 
            fontSize: 22, 
            fontWeight: 700, 
            color: '#5B5BD6', 
            padding: '24px 24px 12px',
            margin: 0,
            borderBottom: '1px solid #e2e8f0'
          }}
        >
          עדכוני גרסה
        </h2>

        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, color: '#334155', fontSize: 15, lineHeight: 1.7 }}>

          {/* 1.0.0 - TutTiud Launch */}
          <li dir="rtl" style={{ marginBottom: 0, textAlign: 'right' }}>
            <article style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <header>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <span style={{ 
                    background: '#5B5BD6', 
                    color: 'white', 
                    padding: '4px 12px', 
                    borderRadius: '6px', 
                    fontSize: '14px',
                    fontWeight: 600
                  }}>
                    גרסה 1.0.0
                  </span>
                  <time dateTime="2025-10-26" style={{ color: '#64748b', fontSize: '14px' }}>
                    26 באוקטובר 2025
                  </time>
                </div>
                <h3 style={{ 
                  fontWeight: 700, 
                  fontSize: 20, 
                  margin: 0,
                  color: '#1e293b',
                  lineHeight: 1.4
                }}>
                  🎉 השקת תותיעוד - מערכת ניהול תלמידים ומפגשים
                </h3>
              </header>

              <section>
                <p style={{ margin: '0 0 16px', color: '#475569', lineHeight: 1.6 }}>
                  ברוכים הבאים למערכת תותיעוד! פלטפורמה מקצועית לניהול תלמידים, תיעוד מפגשים ומעקב אחר התקדמות.
                </p>

                <h4 style={{ fontWeight: 600, fontSize: 16, margin: '16px 0 8px', color: '#334155' }}>
                  תכונות עיקריות:
                </h4>
                <ul style={{ 
                  listStyle: 'none', 
                  padding: 0, 
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>ניהול תלמידים:</strong> הוספה, עריכה וארגון תלמידים עם פרטי קשר מלאים
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>ניהול מדריכים:</strong> הקצאת תלמידים למדריכים והגדרת הרשאות
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>תיעוד מפגשים:</strong> רישום מפגשים עם טופס שאלות מותאם אישית
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>היסטוריית מפגשים:</strong> צפייה בכל המפגשים הקודמים לכל תלמיד
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>ניהול שירותים:</strong> הגדרת סוגי שירותים שונים לארגון
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>טופס מפגש מתקדם:</strong> יצירת שאלות מסוגים שונים (טקסט, מספר, בחירה, סולם ועוד)
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>ממשק מותאם נייד:</strong> עבודה נוחה ממכשירים ניידים וטאבלטים
                  </li>
                  <li style={{ paddingRight: '20px', position: 'relative' }}>
                    <span style={{ position: 'absolute', right: 0, color: '#5B5BD6' }}>•</span>
                    <strong style={{ fontWeight: 600 }}>ניהול ארגונים:</strong> תמיכה בריבוי ארגונים ומשתמשים
                  </li>
                </ul>

                <div style={{ 
                  marginTop: '20px', 
                  padding: '16px', 
                  background: '#f8fafc', 
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}>
                  <p style={{ margin: 0, fontSize: '14px', color: '#475569' }}>
                    <strong style={{ color: '#334155' }}>💡 טיפ:</strong> התחילו בהגדרת הארגון בעמוד ההגדרות, הוסיפו מדריכים ושירותים, ולאחר מכן התחילו להוסיף תלמידים.
                  </p>
                </div>
              </section>
            </article>
          </li>
        </ul>
        </div>
      </div>
      </div>
    );
  }

