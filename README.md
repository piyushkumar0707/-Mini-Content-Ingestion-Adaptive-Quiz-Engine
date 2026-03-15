# Peblo AI — Quiz Context Engine

A Node.js + Express + MongoDB backend that ingests educational PDFs, uses an LLM (Groq) to generate structured quiz questions, and serves them through a REST API with adaptive difficulty based on student performance.

---

## Architecture

```
PDF Upload
    │
    ▼
POST /ingest
    │
    ├── multer (file upload, 20MB limit)
    ├── pdfService → extract text → clean → chunk
    └── MongoDB: SourceDocument + ContentChunk
                        │
                        ▼
            POST /generate-quiz
                        │
                        ├── Groq LLM (llama-3.3-70b-versatile)
                        │   └── batched Promise.all (3 chunks at a time)
                        ├── question validation + quality filter
                        ├── in-memory cache (skip LLM on repeat calls)
                        └── MongoDB: QuizQuestion (compound unique index)
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                  GET /quiz                   POST /submit-answer
                        │                               │
               filter by topic,              evaluate answer
               difficulty, or               update StudentSession
               student session              adaptive difficulty
                                                        │
                                                        ▼
                                            GET /student/:id/difficulty
                                            GET /stats
```

### Key Design Decisions

- **Chunking**: PDFs are split on double-newlines (paragraph boundaries). Chunks under 80 characters are discarded as noise.
- **Batched LLM calls**: Chunks are processed in batches of 3 using `Promise.all` — fast enough to avoid sequential slowness, controlled enough to stay within Groq's free-tier rate limits.
- **Deduplication**: A compound unique index on `{ question, source_chunk_id }` prevents duplicate questions. Bulk inserts use `insertMany({ ordered: false })` so duplicates are caught and counted without throwing errors.
- **Question validation**: MCQ questions must have exactly 4 options with the answer matching one of them. True/False answers must be exactly `"True"` or `"False"`. Questions shorter than 10 characters are discarded as garbage LLM output.
- **Caching**: An in-memory `Set` tracks processed `source_id`s. Repeat calls to `/generate-quiz` return instantly from the DB without touching the LLM.
- **Denormalized fields**: `topic`, `subject`, and `grade` are stored directly on `QuizQuestion` so filtering is always a single MongoDB query with no joins.
- **Adaptive difficulty**: A `StudentSession` tracks `correct_streak` and `incorrect_streak`. 3 correct answers in a row → level up; 2 wrong in a row → level down.
- **Observability**: `GET /stats` returns live system metrics with all DB counts running in parallel.

---

## Folder Structure

```
quiz-context-engine/
├── server.js                  # Entry point — Express + Morgan + rate limiter + MongoDB
├── .env.example               # Environment variable template
├── .gitignore
├── package.json
├── postman_collection.json    # Importable Postman collection for all endpoints
├── samples/
│   ├── sample_chunk.json      # Example extracted content chunk
│   ├── sample_questions.json  # Example generated quiz questions
│   └── sample_api_response.json  # Example responses for all endpoints
└── src/
    ├── controllers/
    │   ├── answerController.js         # POST /submit-answer logic
    │   ├── ingestController.js         # POST /ingest logic
    │   ├── quizGenerationController.js # POST /generate-quiz — batching, validation, cache
    │   ├── quizRetrievalController.js  # GET /quiz — filtering + student session resolution
    │   ├── statsController.js          # GET /stats — system observability metrics
    │   └── studentController.js        # Adaptive difficulty + GET /student/:id/difficulty
    ├── middleware/
    │   ├── errorHandler.js    # Centralized error handler
    │   └── validate.js        # express-validator result handler
    ├── models/
    │   ├── ContentChunk.js    # Extracted text chunks from PDFs
    │   ├── QuizQuestion.js    # Generated quiz questions (compound unique index)
    │   ├── SourceDocument.js  # Uploaded PDF metadata
    │   ├── StudentAnswer.js   # Individual answer records
    │   └── StudentSession.js  # Per-student difficulty state and streaks
    ├── routes/
    │   ├── answer.js          # POST /submit-answer
    │   ├── ingest.js          # POST /ingest
    │   ├── quiz.js            # POST /generate-quiz
    │   ├── quizRetrieval.js   # GET /quiz
    │   ├── stats.js           # GET /stats
    │   └── student.js         # GET /student/:student_id/difficulty
    ├── services/
    │   ├── llmService.js      # Groq API client + structured prompt
    │   └── pdfService.js      # PDF parsing, cleaning, and chunking
    └── utils/
        └── helpers.js         # ID generators for source, chunk, question
```

---

## Database Schema

### SourceDocument
| Field | Type | Description |
|---|---|---|
| `source_id` | String (unique) | e.g. `SRC_1700000000000_ABCD` |
| `title` | String | Original filename |
| `subject` | String | e.g. Math, English, Science |
| `grade` | Number | Grade level 1–12 |
| `topic` | String | e.g. Shapes, Grammar, Plants |
| `uploadedAt` | Date | Upload timestamp |

### ContentChunk
| Field | Type | Description |
|---|---|---|
| `chunk_id` | String (unique) | e.g. `SRC_..._CH_01` |
| `source_id` | String | Reference to SourceDocument |
| `text` | String | Extracted paragraph text |
| `subject` | String | Inherited from source |
| `grade` | Number | Inherited from source |
| `topic` | String | Inherited from source |

### QuizQuestion
| Field | Type | Description |
|---|---|---|
| `question_id` | String (unique) | e.g. `Q_1700000000000_ABCDE` |
| `question` | String | Question text |
| `type` | Enum | `MCQ`, `TrueFalse`, `FillBlank` |
| `options` | [String] | Answer choices |
| `answer` | String | Correct answer |
| `difficulty` | Enum | `easy`, `medium`, `hard` |
| `source_chunk_id` | String | Traceability to source chunk |
| `topic` | String | Denormalized for fast filtering |
| `subject` | String | Denormalized for fast filtering |
| `grade` | Number | Denormalized for fast filtering |

> Compound unique index on `{ question, source_chunk_id }` prevents duplicate questions.

### StudentSession
| Field | Type | Description |
|---|---|---|
| `student_id` | String (unique) | e.g. `S001` |
| `current_difficulty` | Enum | `easy`, `medium`, `hard` |
| `correct_streak` | Number | Consecutive correct answers |
| `incorrect_streak` | Number | Consecutive incorrect answers |
| `updatedAt` | Date | Last updated timestamp |

### StudentAnswer
| Field | Type | Description |
|---|---|---|
| `student_id` | String | Student identifier |
| `question_id` | String | Question answered |
| `selected_answer` | String | Student's submitted answer |
| `is_correct` | Boolean | Whether answer was correct |
| `submittedAt` | Date | Submission timestamp |

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

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | ✅ | PDF file (max 20MB) |
| `grade` | Number | ✅ | Grade level (1–12) |
| `subject` | String | ✅ | Subject name |
| `topic` | String | ✅ | Topic name |

**Response `201`:**
```json
{
  "source_id": "SRC_1700000000000_ABCD",
  "title": "peblo_pdf_grade1_math_numbers.pdf",
  "chunks_saved": 14,
  "chunks_discarded": 3
}
```

**curl:**
```bash
curl -X POST http://localhost:3000/ingest \
  -F "file=@/path/to/doc.pdf" \
  -F "grade=1" \
  -F "subject=Math" \
  -F "topic=Shapes"
```

---

### `POST /generate-quiz`
Generate MCQ, True/False, and Fill-in-the-blank questions from a previously ingested document using the Groq LLM.

- Chunks processed in batches of 3 (rate limit protection)
- Questions validated for structure and quality before saving
- Duplicate questions skipped via compound unique index
- Repeat calls return instantly from cache (`from_cache: true`)
- Rate limited to 10 requests per minute

**Request:**
```json
{ "source_id": "SRC_1700000000000_ABCD" }
```

**Response `200`:**
```json
{
  "source_id": "SRC_1700000000000_ABCD",
  "questions_generated": 42,
  "duplicates_skipped": 0,
  "from_cache": false
}
```

**curl:**
```bash
curl -X POST http://localhost:3000/generate-quiz \
  -H "Content-Type: application/json" \
  -d '{"source_id": "SRC_1700000000000_ABCD"}'
```

---

### `GET /quiz`
Retrieve quiz questions with optional filters.

If `student_id` is provided without an explicit `difficulty`, the student's current adaptive difficulty is used automatically. Explicit `difficulty` always takes precedence.

| Param | Type | Description |
|---|---|---|
| `topic` | String | Case-insensitive regex match |
| `difficulty` | String | `easy`, `medium`, or `hard` |
| `student_id` | String | Auto-resolves difficulty from session |
| `limit` | Number | Max results (default: 10, max: 100) |

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
      "source_chunk_id": "SRC_1700000000000_ABCD_CH_01",
      "topic": "Shapes",
      "subject": "Math",
      "grade": 1
    }
  ]
}
```

**curl:**
```bash
curl "http://localhost:3000/quiz?topic=shapes&difficulty=easy&limit=5"
curl "http://localhost:3000/quiz?student_id=S001&topic=shapes"
```

---

### `POST /submit-answer`
Submit a student answer. Evaluates correctness, saves the attempt, and updates the student's adaptive difficulty session.

**Request:**
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

**curl:**
```bash
curl -X POST http://localhost:3000/submit-answer \
  -H "Content-Type: application/json" \
  -d '{"student_id":"S001","question_id":"Q_1700000000000_ABCDE","selected_answer":"3"}'
```

---

### `GET /student/:student_id/difficulty`
Get a student's current adaptive difficulty state and streak counters.

**Response `200`:**
```json
{
  "student_id": "S001",
  "current_difficulty": "medium",
  "correct_streak": 2,
  "incorrect_streak": 0,
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

### `GET /stats`
Returns live system metrics. All DB counts run in parallel.

**Response `200`:**
```json
{
  "documents_ingested": 3,
  "chunks_stored": 42,
  "questions_generated": 126,
  "questions_by_difficulty": {
    "easy": 54,
    "medium": 48,
    "hard": 24
  },
  "answers_submitted": 20,
  "answers_correct": 14,
  "answers_incorrect": 6,
  "accuracy_rate": "70.0%",
  "active_students": 2
}
```

**curl:**
```bash
curl http://localhost:3000/stats
```

---

## Adaptive Difficulty Logic

| Event | Effect |
|---|---|
| 3 correct answers in a row | Difficulty increases: `easy → medium → hard` |
| 2 incorrect answers in a row | Difficulty decreases: `hard → medium → easy` |
| Any answer | Resets the opposing streak to 0 |

`GET /quiz` automatically uses a student's current difficulty when `student_id` is provided without an explicit `difficulty` param.

---

## Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [MongoDB](https://www.mongodb.com/try/download/community) running locally, or a [MongoDB Atlas](https://www.mongodb.com/atlas) URI
- A free [Groq API key](https://console.groq.com) (no credit card required)

### 1. Clone and install

```bash
git clone <repo-url>
cd quiz-context-engine
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
PORT=3000
MONGO_URI=mongodb://localhost:27017/peblo_quiz
GROQ_API_KEY=gsk_your_key_here
```

### 3. Start MongoDB

**Local:**
```bash
mongod
```

**Or use MongoDB Atlas** — paste your Atlas connection string into `MONGO_URI`.

### 4. Start the server

```bash
npm run dev    # development with auto-reload
npm start      # production
```

Verify at `http://localhost:3000/health` → `{ "status": "ok" }`

---

## Testing with Postman

Import `postman_collection.json` from the repo root. It contains all endpoints pre-configured with collection variables and example responses.

**Manual flow:**

1. `POST /ingest` — upload a PDF, copy `source_id` from response
2. `POST /generate-quiz` — paste `source_id`, wait for questions
3. `GET /quiz?difficulty=easy&limit=5` — copy a `question_id`
4. `POST /submit-answer` — submit answers, watch difficulty update
5. `GET /student/S001/difficulty` — check adaptive session state
6. `GET /stats` — view live system metrics

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/peblo_quiz` |
| `GROQ_API_KEY` | Groq API key | `gsk_...` |

See `.env.example` for the template. **Never commit your `.env` file.**
