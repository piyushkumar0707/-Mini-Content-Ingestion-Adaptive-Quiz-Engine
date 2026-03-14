const { PDFParse } = require('pdf-parse');

/**
 * Extract text from PDF buffer, clean it, and split into chunks.
 * Discards chunks shorter than MIN_CHUNK_LENGTH characters.
 */
const MIN_CHUNK_LENGTH = 80;

async function extractAndChunk(buffer) {
  const parser = new PDFParse({ data: buffer });
  const data = await parser.getText();
  await parser.destroy();
  const rawText = data.text;

  if (rawText.length < 100) {
    console.warn('[pdfService] WARNING: Extracted text is suspiciously short — may be a scanned PDF.');
  }

  // Clean: collapse whitespace, remove page numbers (lines that are just digits)
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .filter(line => !/^\s*\d+\s*$/.test(line))  // remove bare page numbers
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split into chunks by double newline (paragraph breaks)
  const rawChunks = cleaned.split(/\n\n+/);

  const kept = [];
  const discarded = [];

  for (const chunk of rawChunks) {
    const text = chunk.trim();
    if (text.length >= MIN_CHUNK_LENGTH) {
      kept.push(text);
    } else {
      discarded.push(text);
    }
  }

  console.log(`[pdfService] Chunks kept: ${kept.length}, discarded: ${discarded.length}`);
  return { chunks: kept, discarded: discarded.length };
}

module.exports = { extractAndChunk };
