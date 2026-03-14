const SourceDocument = require('../models/SourceDocument');
const ContentChunk = require('../models/ContentChunk');
const { extractAndChunk } = require('../services/pdfService');
const { generateSourceId, generateChunkId } = require('../utils/helpers');

async function ingest(req, res, next) {
  try {
    if (!req.file) {
      const err = new Error('No PDF file uploaded');
      err.status = 400;
      return next(err);
    }

    const { grade, subject, topic } = req.body;
    const sourceId = generateSourceId();

    // Extract and chunk the PDF
    const { chunks, discarded } = await extractAndChunk(req.file.buffer);

    // Save source document
    await SourceDocument.create({
      source_id: sourceId,
      title: req.file.originalname,
      subject,
      grade: Number(grade),
      topic
    });

    // Save all chunks
    const chunkDocs = chunks.map((text, i) => ({
      chunk_id: generateChunkId(sourceId, i),
      source_id: sourceId,
      text,
      subject,
      grade: Number(grade),
      topic
    }));

    await ContentChunk.insertMany(chunkDocs);

    res.status(201).json({
      source_id: sourceId,
      title: req.file.originalname,
      chunks_saved: chunks.length,
      chunks_discarded: discarded
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { ingest };
