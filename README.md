# Peblo AI Quiz Context Engine

A Node.js + Express + MongoDB backend that ingests educational PDFs, uses an LLM to generate quiz questions, and serves them with adaptive difficulty based on student performance.

---

## Architecture

```
PDF Upload → /ingest → pdfService (extract + chunk) → MongoDB (SourceDocument + ContentChunk)
                                                               ↓
/generate-quiz → llmService (GPT-4o-mini) → MongoDB (QuizQuestion)
                                                               ↓
/quiz (GET) ← filtered by topic / difficulty / student session
                                                               ↓
/submit-answer → grade answer → update StudentSession streak → adaptive difficulty
```

### Key design decisions
- **Chunking**: PDFs are split on double-newlines (paragraph boundaries). Chunks < 80 characters are discarded as noise.
- **Deduplication**: Before saving a generated question, the system checks if the exact question text already exists for that chunk.
- **Adaptive difficulty**: A `StudentSession` tracks `correct_streak` and `incorrect_streak`. 3 correct answers in a row → level up; 2 wrong in a row → level down.

---

## Folder Structure

```
QUIZ-CONTEXT ENGINE/
├── server.js
├── .env.example
├── .gitignore
├── package.json
├── samples/
│   ├── sample_chunk.json
│   ├── sample_questions.json
│   └── sample_api_response.json
└── src/
    ├── controllers/
    │   ├── answerController.js
    │   ├── ingestController.js
    │   ├── quizGenerationController.js
    │   ├── quizRetrievalController.js
    │   └── studentController.js
    ├── middleware/
    │   ├── errorHandler.js
    │   └── validate.js
    ├── models/
    │   ├── ContentChunk.js
    │   ├── QuizQuestion.js
    │   ├── SourceDocument.js
    │   ├── StudentAnswer.js
    │   └── StudentSession.js
    ├── routes/
    │   ├── answer.js
    │   ├── ingest.js
    │   ├── quiz.js
    │   ├── quizRetrieval.js
    │   └── student.js
    ├── services/
    │   ├── llmService.js
    │   └── pdfService.js
    └── utils/
        └── helpers.js
```

---

## API Endpoints

### `GET /health`
Returns server status.

**Response:**
```json
{ "status": "ok" }
```

---

### `POST /ingest`
Upload a PDF file to extract and store content chunks.

**Request:** `multipart/form-data`
| Field   | Type   | Required | Description          |
|---------|--------|----------|----------------------|
| file    | File   | ✅       | PDF file to upload   |
| grade   | Number | ✅       | Grade level (e.g. 5) |
| subject | String | ✅       | Subject name         |
| topic   | String | ✅       | Topic name           |

**Response `201`:**
```json
{
  "source_id": "SRC_001",
  "title": "math_grade5.pdf",
  "chunks_saved": 14,
  "chunks_discarded": 3
}
```

**curl example:**
```bash
curl -X POST http://localhost:3000/ingest \
  -F "file=@/path/to/doc.pdf" \
  -F "grade=5" \
  -F "subject=Math" \
  -F "topic=Fractions"
```

---

### `POST /generate-quiz`
Generate quiz questions from a previously ingested document using the LLM.

**Request body:**
```json
{ "source_id": "SRC_001" }
```

**Response `200`:**
```json
{
  "source_id": "SRC_001",
  "questions_generated": 42,
  "duplicates_skipped": 0
}
```

**curl example:**
```bash
curl -X POST http://localhost:3000/generate-quiz \
  -H "Content-Type: application/json" \
  -d '{"source_id": "SRC_001"}'
```

---

### `GET /quiz`
Retrieve quiz questions with optional filters.

**Query parameters:**
| Param      | Type   | Description                                     |
|------------|--------|-------------------------------------------------|
| topic      | String | Filter by topic (case-insensitive regex match)  |
| difficulty | String | `easy`, `medium`, or `hard`                     |
| student_id | String | Uses student's current difficulty if no explicit difficulty given |
| limit      | Number | Max results (default: 10, max: 100)             |

**Response `200`:**
```json
{
  "count": 3,
  "questions": [
    {
      "question_id": "Q_1700000000000_ABCDE",
      "question": "How many sides does a triangle have?",
      "type": "MCQ",
      "options": ["2", "3", "4", "5"],
      "answer": "3",
      "difficulty": "easy",
      "source_chunk_id": "SRC_001_CH_01"
    }
  ]
}
```

**curl example:**
```bash
curl "http://localhost:3000/quiz?topic=shapes&difficulty=easy&limit=5"
```

---

### `POST /submit-answer`
Submit a student's answer and get adaptive difficulty feedback.

**Request body:**
```json
{
  "student_id": "S001",
  "question_id": "Q_1700000000000_ABCDE",
  "selected_answer": "3"
}
```

**Response `200`:**
```json
{
  "is_correct": true,
  "correct_answer": "3",
  "updated_difficulty": "easy"
}
```

**curl example:**
```bash
curl -X POST http://localhost:3000/submit-answer \
  -H "Content-Type: application/json" \
  -d '{"student_id":"S001","question_id":"Q_1700000000000_ABCDE","selected_answer":"3"}'
```

---

### `GET /student/:student_id/difficulty`
Get a student's current adaptive difficulty state.

**Response `200`:**
```json
{
  "student_id": "S001",
  "current_difficulty": "medium",
  "correct_streak": 1,
  "incorrect_streak": 0,
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**curl example:**
```bash
curl http://localhost:3000/student/S001/difficulty
```

---

## Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [MongoDB](https://www.mongodb.com/try/download/community) running locally (or a MongoDB Atlas URI)
- An OpenAI API key (for quiz generation)

### 1. Install MongoDB
Download and start MongoDB Community Edition, or use [MongoDB Atlas](https://www.mongodb.com/atlas).

Default local connection: `mongodb://localhost:27017/peblo_quiz`

### 2. Clone and install
```bash
git clone <repo-url>
cd "QUIZ-CONTEXT ENGINE"
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/peblo_quiz
LLM_API_KEY=sk-...your-openai-key...
```

### 4. Start the server
```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

---

## Testing with Postman

1. **Import** a new collection in Postman.
2. **Ingest a PDF:**
   - Method: `POST`, URL: `http://localhost:3000/ingest`
   - Body → form-data: add `file` (type: File), `grade`, `subject`, `topic`
3. **Generate quiz:**
   - Method: `POST`, URL: `http://localhost:3000/generate-quiz`
   - Body → raw JSON: `{"source_id": "SRC_001"}`
4. **Get questions:**
   - Method: `GET`, URL: `http://localhost:3000/quiz?difficulty=easy&limit=5`
5. **Submit answer:**
   - Method: `POST`, URL: `http://localhost:3000/submit-answer`
   - Body → raw JSON: `{"student_id":"S001","question_id":"<id>","selected_answer":"<answer>"}`
6. **Check student difficulty:**
   - Method: `GET`, URL: `http://localhost:3000/student/S001/difficulty`

---

## Adaptive Difficulty Logic

| Event                          | Effect                              |
|-------------------------------|-------------------------------------|
| 3 correct answers in a row    | Difficulty increases (easy→medium→hard) |
| 2 incorrect answers in a row  | Difficulty decreases (hard→medium→easy) |
| Any answer                    | Resets the opposing streak          |

The `GET /quiz` endpoint automatically uses a student's current difficulty when `student_id` is provided without an explicit `difficulty` param.
