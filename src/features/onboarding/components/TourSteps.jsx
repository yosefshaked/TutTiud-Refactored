/**
 * Tour step definitions for admin/owner and member/instructor roles
 * Each step targets a specific UI element and provides contextual help
 */

export const adminTourSteps = [
  {
    element: 'body',
    popover: {
      title: 'ברוכים הבאים לתותיעוד! 👋',
      description: 'מערכת לניהול ותיעוד מפגשים עם תלמידים. בואו נעשה סיור קצר כדי להכיר את התכונות העיקריות.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour="dashboard"]',
    popover: {
      title: 'מסך ראשי',
      description: 'מסך הבית שלכם - מכאן תוכלו להתחיל לתעד מפגשים ולגשת לרשימת התלמידים.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="admin-students"]',
    popover: {
      title: 'ניהול תלמידים',
      description: 'כאן תוכלו לנהל את רשימת התלמידים, להוסיף תלמידים חדשים ולצפות בפרטיהם.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="fab-button"]',
    popover: {
      title: 'הוספת מפגש חדש',
      description: 'לחצו על כפתור ה-"+" כדי להוסיף מפגש חדש. תוכלו לתעד את הפרטים, משך הזמן והערות.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="settings"]',
    popover: {
      title: 'הגדרות ארגון',
      description: 'בהגדרות תוכלו לנהל משתמשים, להזמין מדריכים חדשים, ולהגדיר העדפות ארגוניות.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: 'body',
    popover: {
      title: 'מוכנים להתחיל! 🚀',
      description: 'זהו! אתם מוכנים להתחיל לתעד מפגשים. תמיד תוכלו לחזור למדריך דרך ההגדרות → "הצג מדריך שוב"',
      side: 'over',
      align: 'center',
    },
  },
];

export const memberTourSteps = [
  {
    element: 'body',
    popover: {
      title: 'ברוכים הבאים לתותיעוד! 👋',
      description: 'מערכת לתיעוד ומעקב אחר המפגשים שלכם עם תלמידים. בואו נעשה סיור קצר כדי להכיר את המערכת.',
      side: 'over',
      align: 'center',
    },
  },
  {
    element: '[data-tour="dashboard"]',
    popover: {
      title: 'מסך ראשי',
      description: 'מסך הבית שלכם - מכאן תוכלו להתחיל לתעד מפגשים ולגשת לרשימת התלמידים שלכם.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="my-students"]',
    popover: {
      title: 'התלמידים שלי',
      description: 'כאן תוכלו לצפות ברשימת התלמידים שלכם ולמעקב אחר ההתקדמות שלהם.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '[data-tour="fab-button"]',
    popover: {
      title: 'הוספת מפגש חדש',
      description: 'לחצו על כפתור ה-"+" כדי להוסיף מפגש חדש עם תלמיד. תוכלו לתעד פרטים, משך זמן והערות.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: 'body',
    popover: {
      title: 'מוכנים להתחיל! 🚀',
      description: 'זהו! אתם מוכנים להתחיל לתעד מפגשים עם התלמידים שלכם. תמיד תוכלו לחזור למדריך דרך ההגדרות → "הצג מדריך שוב"',
      side: 'over',
      align: 'center',
    },
  },
];

export function getTourSteps(isAdmin) {
  return isAdmin ? adminTourSteps : memberTourSteps;
}
