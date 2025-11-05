/* eslint-env browser */

/**
 * Check if a character is Hebrew
 * @param {string} char - Character to check
 * @returns {boolean} True if Hebrew
 */
function isHebrew(char) {
  const code = char.charCodeAt(0);
  return (code >= 0x0590 && code <= 0x05FF) || (code >= 0xFB1D && code <= 0xFB4F);
}

/**
 * Reverse Hebrew text for proper RTL display in jsPDF
 * This function handles mixed Hebrew and Latin text, reversing only the Hebrew portions
 * @param {string} text - Text to process
 * @returns {string} Processed text with Hebrew portions reversed
 */
export function reverseHebrewText(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);

  // Split into segments by Hebrew vs non-Hebrew. We will reverse only the
  // characters inside Hebrew segments and keep the overall segment order.
  // This preserves the natural order of numbers and punctuation.
  const segments = [];
  let buf = '';
  let currentHebrew = undefined;

  const flush = () => {
    if (!buf) return;
    if (currentHebrew === true) {
      segments.push(buf.split('').reverse().join(''));
    } else {
      segments.push(buf);
    }
    buf = '';
  };

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const isHeb = isHebrew(ch);
    if (currentHebrew === undefined) {
      currentHebrew = isHeb;
      buf = ch;
    } else if (isHeb === currentHebrew) {
      buf += ch;
    } else {
      flush();
      currentHebrew = isHeb;
      buf = ch;
    }
  }
  flush();

  // Join segments in original order
  return segments.join('');
}

/**
 * Load and add Hebrew font to jsPDF
 * @param {Object} doc - jsPDF document instance
 * @returns {Promise<void>}
 */
export async function addHebrewFont(doc) {
  try {
    // Fetch Rubik font from Google Fonts (supports Hebrew and Latin characters)
    const fontUrl = 'https://fonts.gstatic.com/s/rubik/v28/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-WYi1UE80V4bVkA.ttf';
    const response = await fetch(fontUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status}`);
    }
    
    const fontArrayBuffer = await response.arrayBuffer();
    
    // Convert ArrayBuffer to base64 string
    const fontBase64 = btoa(
      new Uint8Array(fontArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    
    // Add the font to jsPDF
    doc.addFileToVFS('Rubik-Regular.ttf', fontBase64);
    doc.addFont('Rubik-Regular.ttf', 'Rubik', 'normal');
    doc.setFont('Rubik');
    
    console.log('Hebrew font loaded successfully');
  } catch (error) {
    console.warn('Failed to load Hebrew font, text may not render correctly:', error);
    // Fallback to default font - Hebrew text will appear garbled
  }
}
