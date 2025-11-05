/* eslint-env browser */

/**
 * Legacy helper kept for backwards compatibility with older PDF exports.
 * jsPDF now handles bidi text directly, so we simply coerce to string.
 * @param {string} text - Text to process
 * @returns {string} Stringified text ready for rendering
 */
export function reverseHebrewText(text) {
  if (text === null || text === undefined) return '';
  // jsPDF 2.5+ offers native bidi support, so we no longer need to flip glyphs.
  // Keep this function as a passthrough for backwards compatibility.
  return String(text);
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
