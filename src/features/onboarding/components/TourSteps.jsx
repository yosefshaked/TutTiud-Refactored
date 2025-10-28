/**
 * Tour step definitions for admin/owner and member/instructor roles
 * Each step targets a specific UI element and provides contextual help
 */

export const adminTourSteps = [
  {
    target: 'body',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 'bold' }}>
          ברוכים הבאים לתותיעוד! 👋
        </h3>
        <p style={{ lineHeight: '1.6', marginBottom: '12px' }}>
          מערכת לניהול ותיעוד מפגשים עם תלמידים.
        </p>
        <p style={{ lineHeight: '1.6' }}>
          בואו נעשה סיור קצר כדי להכיר את התכונות העיקריות.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="fab-button"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          הוספת מפגש חדש
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          לחצו על כפתור ה-"+" כדי להוסיף מפגש חדש. תוכלו לתעד את הפרטים, משך הזמן והערות.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="admin-students"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          ניהול תלמידים
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          כאן תוכלו לנהל את רשימת התלמידים, להוסיף תלמידים חדשים ולצפות בפרטיהם.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="dashboard"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          לוח הבקרה
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          כאן תוכלו לראות סיכום של כל המפגשים, דוחות וסטטיסטיקות מהירות.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="settings"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          הגדרות ארגון
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          בהגדרות תוכלו לנהל משתמשים, להזמין מדריכים חדשים, ולהגדיר העדפות ארגוניות.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: 'body',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 'bold' }}>
          מוכנים להתחיל! 🚀
        </h3>
        <p style={{ lineHeight: '1.6', marginBottom: '12px' }}>
          זהו! אתם מוכנים להתחיל לתעד מפגשים.
        </p>
        <p style={{ lineHeight: '1.6', fontSize: '14px', color: '#666' }}>
          תמיד תוכלו לחזור למדריך דרך ההגדרות → "הצג מדריך שוב"
        </p>
      </div>
    ),
    placement: 'center',
  },
];

export const memberTourSteps = [
  {
    target: 'body',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 'bold' }}>
          ברוכים הבאים לתותיעוד! 👋
        </h3>
        <p style={{ lineHeight: '1.6', marginBottom: '12px' }}>
          מערכת לתיעוד ומעקב אחר המפגשים שלכם עם תלמידים.
        </p>
        <p style={{ lineHeight: '1.6' }}>
          בואו נעשה סיור קצר כדי להכיר את המערכת.
        </p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="fab-button"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          הוספת מפגש חדש
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          לחצו על כפתור ה-"+" כדי להוסיף מפגש חדש עם תלמיד. תוכלו לתעד פרטים, משך זמן והערות.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="my-students"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          התלמידים שלי
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          כאן תוכלו לצפות ברשימת התלמידים שלכם ולמעקב אחר ההתקדמות שלהם.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: '[data-tour="dashboard"]',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: 'bold' }}>
          לוח הבקרה
        </h3>
        <p style={{ lineHeight: '1.6' }}>
          כאן תוכלו לראות סיכום של המפגשים שלכם והיסטוריה עדכנית.
        </p>
      </div>
    ),
    placement: 'left',
  },
  {
    target: 'body',
    content: (
      <div style={{ textAlign: 'right', direction: 'rtl' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '18px', fontWeight: 'bold' }}>
          מוכנים להתחיל! 🚀
        </h3>
        <p style={{ lineHeight: '1.6', marginBottom: '12px' }}>
          זהו! אתם מוכנים להתחיל לתעד מפגשים עם התלמידים שלכם.
        </p>
        <p style={{ lineHeight: '1.6', fontSize: '14px', color: '#666' }}>
          תמיד תוכלו לחזור למדריך דרך ההגדרות → "הצג מדריך שוב"
        </p>
      </div>
    ),
    placement: 'center',
  },
];

/**
 * Get appropriate tour steps based on user role
 * @param {boolean} isAdmin - Whether user has admin/owner role
 * @returns {Array} Array of tour step objects
 */
export function getTourSteps(isAdmin) {
  return isAdmin ? adminTourSteps : memberTourSteps;
}
