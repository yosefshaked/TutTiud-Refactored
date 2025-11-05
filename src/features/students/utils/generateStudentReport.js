/* eslint-env browser */
import { jsPDF } from 'jspdf';
import { addHebrewFont } from './hebrewFontHelper.js';

/**
 * Fetch and convert an image URL to a data URL for embedding in PDF
 * @param {string} url - Image URL
 * @returns {Promise<string|null>} Base64 data URL or null on failure
 */
async function fetchImageAsDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Failed to fetch image from ${url}`);
      return null;
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
}

/**
 * Get dimensions for image to fit within bounds while maintaining aspect ratio
 * @param {number} imgWidth - Original image width
 * @param {number} imgHeight - Original image height
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @returns {{width: number, height: number}} Fitted dimensions
 */
function fitImageToBounds(imgWidth, imgHeight, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
  return {
    width: imgWidth * ratio,
    height: imgHeight * ratio,
  };
}

/**
 * Generate a professional PDF report for a student's session records
 * @param {Object} options - Generation options
 * @param {Object} options.student - Student information
 * @param {Array} options.sessions - Array of session records
 * @param {Object} options.org - Organization context with permissions and logo
 * @param {Array} options.questions - Session form questions configuration
 * @returns {Promise<void>} Downloads the PDF
 */
export async function generateStudentReport({ student, sessions, org, questions = [] }) {
  if (!student) {
    throw new Error('Student data is required');
  }

  // Create a new PDF document (A4 size)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // Load Hebrew font for proper text rendering
  await addHebrewFont(doc);

  // Page dimensions
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (2 * margin);
  
  // Color palette - professional blue and gray scheme
  const colors = {
    primary: [37, 99, 235], // Blue-600 RGB
    secondary: [100, 116, 139], // Slate-500 RGB
    text: [30, 41, 59], // Slate-800 RGB
    lightGray: [241, 245, 249], // Slate-100 RGB
    border: [203, 213, 225], // Slate-300 RGB
  };

  let yPos = margin;

  // Helper to check if we need a new page
  const checkPageBreak = (requiredSpace) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Header with logo(s)
  const logoHeight = 15;
  const logoWidth = 40;

  // Always render TutTiud logo on the right (RTL convention)
  doc.setFontSize(16);
  doc.setTextColor(...colors.primary);
  doc.text('TutTiud', pageWidth - margin - 30, yPos + 10, { align: 'right' });

  // Conditionally render organization logo on the left if permission is enabled
  if (org?.permissions?.can_use_custom_logo_on_exports && org?.logoUrl) {
    try {
      const orgLogoData = await fetchImageAsDataUrl(org.logoUrl);
      if (orgLogoData) {
        // Create a temporary image to get dimensions
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = orgLogoData;
        });
        
        const fitted = fitImageToBounds(img.width, img.height, logoWidth, logoHeight);
        doc.addImage(orgLogoData, 'PNG', margin, yPos, fitted.width, fitted.height);
      }
    } catch (error) {
      console.warn('Failed to load organization logo:', error);
    }
  }

  yPos += logoHeight + 10;

  // Title
  doc.setFontSize(20);
  doc.setTextColor(...colors.text);
  doc.text('דוח מפגשים', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Student information section
  doc.setFontSize(14);
  doc.setTextColor(...colors.primary);
  doc.text('פרטי תלמיד', pageWidth - margin, yPos, { align: 'right' });
  yPos += 8;

  // Student details
  const studentDetails = [
    { label: 'שם התלמיד', value: student.name || 'לא צוין' },
    { label: 'שירות ברירת מחדל', value: student.default_service || 'לא הוגדר' },
    { label: 'שם איש קשר', value: student.contact_name || 'לא סופק' },
    { label: 'טלפון', value: student.contact_phone || 'לא סופק' },
  ];

  doc.setFontSize(10);
  doc.setTextColor(...colors.text);
  studentDetails.forEach((detail) => {
    checkPageBreak(7);
    doc.setFont('Rubik', 'bold');
    const text = `${detail.label}: ${detail.value}`;
    doc.text(text, pageWidth - margin, yPos, { align: 'right' });
    doc.setFont('Rubik', 'normal');
    yPos += 6;
  });

  yPos += 8;

  // Sessions section
  checkPageBreak(15);
  doc.setFontSize(14);
  doc.setTextColor(...colors.primary);
  doc.text('היסטוריית מפגשים', pageWidth - margin, yPos, { align: 'right' });
  yPos += 10;

  if (!sessions || sessions.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...colors.secondary);
    doc.text('לא נמצאו מפגשים מתועדים', pageWidth - margin, yPos, { align: 'right' });
  } else {
    // Sort sessions by date (most recent first)
    const sortedSessions = [...sessions].sort((a, b) => {
      if (!a?.date || !b?.date) return 0;
      return a.date < b.date ? 1 : -1;
    });

    for (const session of sortedSessions) {
      checkPageBreak(20);

      // Session date header with background
      doc.setFillColor(...colors.lightGray);
      doc.setDrawColor(...colors.border);
      doc.rect(margin, yPos, contentWidth, 8, 'FD');
      
      doc.setFontSize(11);
      doc.setTextColor(...colors.text);
      doc.setFont('Rubik', 'bold');
      doc.text(formatSessionDate(session.date), pageWidth - margin - 2, yPos + 5.5, { align: 'right' });
      yPos += 10;

      // Service context
      if (session.service_context) {
        checkPageBreak(7);
        doc.setFontSize(9);
        doc.setTextColor(...colors.secondary);
        doc.setFont('Rubik', 'normal');
        doc.text(`שירות: ${session.service_context}`, pageWidth - margin - 2, yPos, { align: 'right' });
        yPos += 6;
      }

      // Session content/answers
      const answers = buildAnswerList(session.content, questions);
      
      if (answers.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(...colors.text);
        
        for (const answer of answers) {
          checkPageBreak(15);

          doc.setFont('Rubik', 'bold');
          doc.text(answer.label, pageWidth - margin - 2, yPos, { align: 'right' });
          yPos += 5;

          doc.setFont('Rubik', 'normal');
          // Split text into lines to handle wrapping
          const lines = doc.splitTextToSize(answer.value, contentWidth - 4);
          lines.forEach((line) => {
            checkPageBreak(5);
            doc.text(line, pageWidth - margin - 2, yPos, { align: 'right', maxWidth: contentWidth - 4 });
            yPos += 5;
          });
          yPos += 3;
        }
      } else {
        checkPageBreak(7);
        doc.setFontSize(9);
        doc.setTextColor(...colors.secondary);
        doc.text('לא תועדו תשובות עבור מפגש זה', pageWidth - margin - 2, yPos, { align: 'right' });
        yPos += 6;
      }

      yPos += 5; // Space between sessions
    }
  }

  // Footer with generation date on all pages
  const totalPages = doc.internal.pages.length - 1; // -1 because pages array includes a null first element
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...colors.secondary);
    const footerText = `נוצר בתאריך ${new Date().toLocaleDateString('he-IL')} | עמוד ${i} מתוך ${totalPages}`;
    doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  // Generate filename with student name and date
  const date = new Date().toISOString().split('T')[0];
  const studentName = (student.name || 'Student').replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '_');
  const filename = `${studentName}_Records_${date}.pdf`;

  // Save the PDF
  doc.save(filename);
}

/**
 * Format session date for display
 * @param {string} value - ISO date string
 * @returns {string} Formatted date
 */
function formatSessionDate(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  } catch {
    // ignore parsing failures
  }
  return value;
}

/**
 * Parse session content into structured data
 * @param {*} raw - Raw session content
 * @returns {Object} Parsed content
 */
function parseSessionContent(raw) {
  if (raw === null || raw === undefined) {
    return {};
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      return { notes: trimmed };
    }
    return { notes: trimmed };
  }
  if (typeof raw === 'object') {
    return raw;
  }
  return {};
}

/**
 * Build a list of question-answer pairs from session content
 * @param {*} content - Session content
 * @param {Array} questions - Form questions configuration
 * @returns {Array<{label: string, value: string}>} Answer list
 */
function buildAnswerList(content, questions) {
  const answers = parseSessionContent(content);
  const entries = [];
  const seenKeys = new Set();

  if (answers && typeof answers === 'object' && !Array.isArray(answers)) {
    for (const question of questions) {
      const key = question.key;
      const label = question.label;
      let value = answers[key];
      if (value === undefined && typeof answers[label] !== 'undefined') {
        value = answers[label];
      }
      if (value === undefined || value === null || value === '') {
        continue;
      }
      entries.push({ label, value: String(value) });
      seenKeys.add(key);
      seenKeys.add(label);
    }

    for (const [rawKey, rawValue] of Object.entries(answers)) {
      if (rawValue === undefined || rawValue === null || rawValue === '') {
        continue;
      }
      const normalizedKey = String(rawKey);
      if (seenKeys.has(normalizedKey)) {
        continue;
      }
      entries.push({ label: normalizedKey, value: String(rawValue) });
    }
  } else if (typeof answers === 'string' && answers.trim()) {
    entries.push({ label: 'תוכן המפגש', value: answers.trim() });
  }

  return entries;
}
