/* eslint-env browser */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Create HTML content for the PDF report
 * @param {Object} student - Student information
 * @param {Array} sessions - Session records
 * @param {Object} org - Organization context
 * @param {Array} questions - Form questions
 * @returns {HTMLElement} Container element with report content
 */
function createReportHTML(student, sessions, org, questions) {
  const container = document.createElement('div');
  container.style.cssText = `
    width: 210mm;
    padding: 20mm;
    background: white;
    font-family: Arial, sans-serif;
    direction: rtl;
    color: #1e293b;
  `;

  // Header with logos
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;';
  
  // TutTiud logo (right side for RTL)
  const tuttiudLogo = document.createElement('div');
  tuttiudLogo.textContent = 'TutTiud';
  tuttiudLogo.style.cssText = 'font-size: 20px; font-weight: bold; color: #2563eb;';
  header.appendChild(tuttiudLogo);

  // Org logo (left side for RTL) - conditional
  if (org?.permissions?.can_use_custom_logo_on_exports && org?.logoUrl) {
    const orgLogo = document.createElement('img');
    orgLogo.src = org.logoUrl;
    orgLogo.style.cssText = 'max-height: 40px; max-width: 100px; object-fit: contain;';
    orgLogo.onerror = () => { orgLogo.style.display = 'none'; };
    header.appendChild(orgLogo);
  }

  container.appendChild(header);

  // Title
  const title = document.createElement('h1');
  title.textContent = 'דוח מפגשים';
  title.style.cssText = 'text-align: center; font-size: 24px; margin: 20px 0; color: #1e293b;';
  container.appendChild(title);

  // Student Info Section
  const studentSection = document.createElement('div');
  studentSection.style.cssText = 'margin-bottom: 30px;';
  
  const studentTitle = document.createElement('h2');
  studentTitle.textContent = 'פרטי תלמיד';
  studentTitle.style.cssText = 'font-size: 16px; color: #2563eb; margin-bottom: 15px; font-weight: bold;';
  studentSection.appendChild(studentTitle);

  const studentDetails = [
    { label: 'שם התלמיד', value: student.name || 'לא צוין' },
    { label: 'שירות ברירת מחדל', value: student.default_service || 'לא הוגדר' },
    { label: 'שם איש קשר', value: student.contact_name || 'לא סופק' },
    { label: 'טלפון', value: student.contact_phone || 'לא סופק' },
  ];

  studentDetails.forEach(detail => {
    const detailDiv = document.createElement('div');
    detailDiv.style.cssText = 'margin-bottom: 8px; font-size: 11px;';
    detailDiv.innerHTML = `<strong>${detail.label}:</strong> ${detail.value}`;
    studentSection.appendChild(detailDiv);
  });

  container.appendChild(studentSection);

  // Sessions Section
  const sessionsTitle = document.createElement('h2');
  sessionsTitle.textContent = 'היסטוריית מפגשים';
  sessionsTitle.style.cssText = 'font-size: 16px; color: #2563eb; margin-bottom: 15px; font-weight: bold;';
  container.appendChild(sessionsTitle);

  if (!sessions || sessions.length === 0) {
    const noSessions = document.createElement('div');
    noSessions.textContent = 'לא נמצאו מפגשים מתועדים';
    noSessions.style.cssText = 'color: #64748b; font-size: 11px;';
    container.appendChild(noSessions);
  } else {
    // Sort sessions by date
    const sortedSessions = [...sessions].sort((a, b) => {
      if (!a?.date || !b?.date) return 0;
      return a.date < b.date ? 1 : -1;
    });

    sortedSessions.forEach(session => {
      const sessionDiv = document.createElement('div');
      sessionDiv.style.cssText = 'margin-bottom: 20px; page-break-inside: avoid;';

      // Session header
      const sessionHeader = document.createElement('div');
      sessionHeader.style.cssText = 'background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px; margin-bottom: 10px; font-weight: bold; font-size: 12px;';
      sessionHeader.textContent = formatSessionDate(session.date);
      sessionDiv.appendChild(sessionHeader);

      // Service context
      if (session.service_context) {
        const service = document.createElement('div');
        service.style.cssText = 'color: #64748b; font-size: 10px; margin-bottom: 8px; padding-right: 8px;';
        service.textContent = `שירות: ${session.service_context}`;
        sessionDiv.appendChild(service);
      }

      // Answers
      const answers = buildAnswerList(session.content, questions);
      if (answers.length > 0) {
        answers.forEach(answer => {
          const answerDiv = document.createElement('div');
          answerDiv.style.cssText = 'margin-bottom: 12px; padding-right: 8px; font-size: 10px;';
          
          const label = document.createElement('div');
          label.style.cssText = 'font-weight: bold; margin-bottom: 4px;';
          label.textContent = answer.label;
          answerDiv.appendChild(label);

          const value = document.createElement('div');
          value.style.cssText = 'white-space: pre-wrap; word-break: break-word;';
          value.textContent = answer.value;
          answerDiv.appendChild(value);

          sessionDiv.appendChild(answerDiv);
        });
      } else {
        const noAnswers = document.createElement('div');
        noAnswers.style.cssText = 'color: #64748b; font-size: 10px; padding-right: 8px;';
        noAnswers.textContent = 'לא תועדו תשובות עבור מפגש זה';
        sessionDiv.appendChild(noAnswers);
      }

      container.appendChild(sessionDiv);
    });
  }

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top: 30px; text-align: center; font-size: 8px; color: #64748b;';
  footer.textContent = `נוצר בתאריך ${new Date().toLocaleDateString('he-IL')}`;
  container.appendChild(footer);

  return container;
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

  // Create HTML content
  const container = createReportHTML(student, sessions, org, questions);
  
  // Temporarily add to document for rendering
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  document.body.appendChild(container);

  try {
    // Wait for any images to load
    const images = container.getElementsByTagName('img');
    if (images.length > 0) {
      await Promise.all(
        Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; // Resolve anyway to not block
            setTimeout(resolve, 2000); // Timeout after 2 seconds
          });
        })
      );
    }

    // Convert HTML to canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher quality
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    // Create PDF
    const imgWidth = 210; // A4 width in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pageHeight = 297; // A4 height in mm
    
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    let heightLeft = imgHeight;
    let position = 0;

    // Add first page
    doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if needed
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      doc.addPage();
      doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Generate filename with student name and date
    const date = new Date().toISOString().split('T')[0];
    const studentName = (student.name || 'Student').replace(/[^a-zA-Z0-9\u0590-\u05FF]/g, '_');
    const filename = `${studentName}_Records_${date}.pdf`;

    // Save the PDF
    doc.save(filename);
  } finally {
    // Clean up: remove temporary container
    document.body.removeChild(container);
  }
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
