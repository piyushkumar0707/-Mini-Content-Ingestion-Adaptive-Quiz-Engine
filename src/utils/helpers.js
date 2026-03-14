let srcCounter = 1;

function generateSourceId() {
  return `SRC_${String(srcCounter++).padStart(3, '0')}`;
}

function generateChunkId(sourceId, index) {
  return `${sourceId}_CH_${String(index + 1).padStart(2, '0')}`;
}

function generateQuestionId() {
  return `Q_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

module.exports = { generateSourceId, generateChunkId, generateQuestionId };
