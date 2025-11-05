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
  if (!text) return '';
  
  // Split text into segments of Hebrew and non-Hebrew
  const segments = [];
  let currentSegment = '';
  let isCurrentSegmentHebrew = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charIsHebrew = isHebrew(char);
    
    if (i === 0) {
      isCurrentSegmentHebrew = charIsHebrew;
      currentSegment = char;
    } else if (charIsHebrew === isCurrentSegmentHebrew) {
      currentSegment += char;
    } else {
      segments.push({ text: currentSegment, isHebrew: isCurrentSegmentHebrew });
      currentSegment = char;
      isCurrentSegmentHebrew = charIsHebrew;
    }
  }
  
  // Push the last segment
  if (currentSegment) {
    segments.push({ text: currentSegment, isHebrew: isCurrentSegmentHebrew });
  }
  
  // Reverse Hebrew segments and reverse the order of segments for RTL
  const processedSegments = segments.map(seg => {
    if (seg.isHebrew) {
      // Reverse the Hebrew text
      return seg.text.split('').reverse().join('');
    }
    return seg.text;
  });
  
  // For RTL text, reverse the order of segments
  const hasHebrew = segments.some(seg => seg.isHebrew);
  if (hasHebrew) {
    return processedSegments.reverse().join('');
  }
  
  return processedSegments.join('');
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
