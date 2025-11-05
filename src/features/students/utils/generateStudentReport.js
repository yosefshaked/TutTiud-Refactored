/* eslint-env browser */
import { jsPDF } from 'jspdf';
import "@/lib/fonts/rubik"; // Rubik font JS (converted via jsPDF fontconverter)
import { addHebrewFont } from './hebrewFontHelper.js';

const HEBREW_REGEX = /[\u0590-\u05FF]/;

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
    width: Math.round(imgWidth * ratio),
    height: Math.round(imgHeight * ratio),
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
  // Ensure we use the embedded Hebrew-capable font
  try { doc.setFont('Rubik', 'normal'); } catch (e) { void e; /* ignore missing style variant in jsPDF */ }

  // Render text with automatic RTL handling when Hebrew glyphs are detected
  const drawText = (value, x, y, drawOptions = {}) => {
    const str = value == null ? '' : String(value);
    if (str.length === 0) {
      return;
    }
    const opts = { ...drawOptions };
    if (HEBREW_REGEX.test(str)) {
      // Let jsPDF handle bidi reordering; do not flip output
      opts.lang = 'he';
      opts.isInputRtl = true;
      // opts.isOutputRtl left false/undefined to avoid reversing numbers/Latin
    }
    doc.text(str, x, y, opts);
  };

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
  // Helper for page break (keeps yPos in bounds)
  function checkPageBreak(requiredSpace) {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  }

  // Header with logo(s)
  const logoHeight = 15;
  const logoWidth = 40;

  // Try to render the TutTiud app logo image on the right; fall back to text
  let rightHeaderUsed = false;
  try {
    const appLogoUrl = (typeof window !== 'undefined' && window.location) ? `${window.location.origin}/icon.svg` : '/icon.svg';
    const appLogoData = await fetchImageAsDataUrl(appLogoUrl);
    if (appLogoData) {
      const tmp = new Image();
      await new Promise((resolve, reject) => {
        tmp.onload = resolve;
        tmp.onerror = reject;
        tmp.src = appLogoData;
      });
      const fitted = fitImageToBounds(tmp.width, tmp.height, logoWidth, logoHeight);

      // Format detection + rasterize fallback
      let appData = appLogoData;
      let appFmt = 'PNG';
      const pfx = appLogoData.slice(0, 32).toLowerCase();
      if (pfx.startsWith('data:image/jpeg') || pfx.startsWith('data:image/jpg')) appFmt = 'JPEG';
      else if (pfx.startsWith('data:image/png')) appFmt = 'PNG';
      else {
        try {
          const c = document.createElement('canvas');
          c.width = tmp.width; c.height = tmp.height;
          const ctx = c.getContext('2d');
          ctx.drawImage(tmp, 0, 0);
          appData = c.toDataURL('image/png');
          appFmt = 'PNG';
        } catch (e) { void e; }
      }
      if (appData) {
        // place at right
        doc.addImage(appData, appFmt, pageWidth - margin - fitted.width, yPos, fitted.width, fitted.height);
        rightHeaderUsed = true;
      }
    }
  } catch (e) {
    void e; // fallback to text
  }

  if (!rightHeaderUsed) {
    doc.setFontSize(16);
    doc.setTextColor(...colors.primary);
    drawText('TutTiud', pageWidth - margin - 2, yPos + 10, { align: 'right' });
  }

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

        // Detect format or rasterize unsupported types to PNG
        let dataForPdf = orgLogoData;
        let format = 'PNG';
        const prefix = orgLogoData.slice(0, 32).toLowerCase();
        if (prefix.startsWith('data:image/jpeg') || prefix.startsWith('data:image/jpg')) {
          format = 'JPEG';
        } else if (prefix.startsWith('data:image/png')) {
          format = 'PNG';
        } else {
          // Rasterize (e.g., SVG/WebP) to PNG to ensure compatibility
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            dataForPdf = canvas.toDataURL('image/png');
            format = 'PNG';
          } catch (e) {
            console.warn('Failed to rasterize logo; skipping custom logo in PDF', e);
          }
        }

        if (dataForPdf) {
          doc.addImage(dataForPdf, format, margin, yPos, fitted.width, fitted.height);
        }
      }
    } catch (error) {
      console.warn('Failed to load organization logo:', error);
    }
  }

  // Underline separator
  doc.setDrawColor(...colors.border);
  doc.setLineWidth(0.3);
  doc.line(margin, yPos + logoHeight + 6, pageWidth - margin, yPos + logoHeight + 6);
  yPos += logoHeight + 12;

  // Student information block
  checkPageBreak(30);
  doc.setFillColor(...colors.lightGray);
  doc.setDrawColor(...colors.border);
  doc.rect(margin, yPos, contentWidth, 24, 'FD');

  doc.setTextColor(...colors.text);
  doc.setFontSize(12);
  drawText('פרטי תלמיד', pageWidth - margin - 2, yPos + 7, { align: 'right' });

  doc.setFontSize(10);
  const line1 = `שם: ${student?.name ?? ''}`;
  const line2 = `טלפון: ${student?.contact_phone ?? ''}`;
  const line3 = `מדריך: ${student?.instructor_name ?? ''}`;
  const line4 = `שירות: ${student?.default_service ?? ''}`;

  const colRightX = pageWidth - margin - 2;
  const colLeftX = margin + 2 + contentWidth / 2;
  drawText(line1, colRightX, yPos + 14, { align: 'right' });
  drawText(line2, colRightX, yPos + 20, { align: 'right' });
  drawText(line3, colLeftX, yPos + 14, { align: 'right' });
  drawText(line4, colLeftX, yPos + 20, { align: 'right' });

  yPos += 34;

  // Sessions section
  checkPageBreak(15);
  doc.setFontSize(14);
  doc.setTextColor(...colors.primary);
  drawText('היסטוריית מפגשים', pageWidth - margin, yPos, { align: 'right' });
  yPos += 10;

  if (!sessions || sessions.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(...colors.secondary);
    drawText('לא נמצאו מפגשים מתועדים', pageWidth - margin, yPos, { align: 'right' });
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
    try { doc.setFont('Rubik', 'normal'); } catch (e) { void e; }
    drawText(formatSessionDate(session.date), pageWidth - margin - 2, yPos + 5.5, { align: 'right' });
      yPos += 10;

      // Service context
      if (session.service_context) {
        checkPageBreak(7);
    doc.setFontSize(9);
    doc.setTextColor(...colors.secondary);
    try { doc.setFont('Rubik', 'normal'); } catch (e) { void e; }
    drawText(`שירות: ${session.service_context}`, pageWidth - margin - 2, yPos, { align: 'right' });
        yPos += 6;
      }

      // Session content/answers
      const answers = buildAnswerList(session.content, questions);
      
      if (answers.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(...colors.text);
    try { doc.setFont('Rubik', 'normal'); } catch (e) { void e; }

        for (const answer of answers) {
          checkPageBreak(15);

          // Question label
          drawText(answer.label, pageWidth - margin - 2, yPos, { align: 'right' });
          yPos += 5;

          // Split text into lines to handle wrapping (apply RTL processing first)
          const wrapped = doc.splitTextToSize(String(answer.value ?? ''), contentWidth - 4);
          wrapped.forEach((line) => {
            checkPageBreak(5);
            drawText(line, pageWidth - margin - 2, yPos, { align: 'right', maxWidth: contentWidth - 4 });
            yPos += 5;
          });
          yPos += 3;
        }
      } else {
        checkPageBreak(7);
  doc.setFontSize(9);
  doc.setTextColor(...colors.secondary);
  drawText('לא תועדו תשובות עבור מפגש זה', pageWidth - margin - 2, yPos, { align: 'right' });
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
    drawText(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
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
