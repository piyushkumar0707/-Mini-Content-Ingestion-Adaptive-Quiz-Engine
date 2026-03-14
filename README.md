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
    ├── multer (file upload)
    ├── pdfService → extract text → clean → chunk
    └── MongoDB: SourceDocument + ContentChunk
                        │
                        ▼
            POST /generate-quiz
                        │
                        ├── Groq LLM (llama-3.3-70b-versatile)
                        │   └── parallel calls via Promise.all
                        └── MongoDB: QuizQuestion
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                  GET /quiz                   POST /submit-answer
                        │                               │
               filter by topic,              evaluate answer
               difficulty, or               update StudentSession
               student session              adaptive difficulty
```

### Key Design Decisions

- **Chunking**: PDFs are split on double-newlines (paragraph boundaries). Chunks under 80 characters are discarded as noise.
- **Parallel LLM calls**: All chunks are processed simultaneously using `Promise.all`, making quiz generation significantly faster than sequential calls.
- **Deduplication**: A compound unique index on `{ question, source_chunk_id }` prevents duplicate questions. Bulk inserts use `insertMany({ ordered: false })` and duplicate key errors are caught and counted.
- **Denormalized topic/subject/grade**: These fields are stored directly on `QuizQuestion` to avoid extra DB lookups on every retrieval request.
- **Adaptive difficulty**: A `StudentSession` tracks `correct_streak` and `incorrect_streak`. 3 correct answers in a row → level up; 2 wrong in a row → level down.

---

## Folder Structure

```
quiz-context-engine/
├── server.js                  # Entry point — Express app + MongoDB connection
├── .env.example               # Environment variable template
├── .gitignore
├── package.json
├── samples/
│   ├── sample_chunk.json      # Example extracted content chunk
│   ├── sample_questions.json  # Example generated quiz questions
│   └── sample_api_response.json  # Example responses for all endpoints
└── src/
    ├── controllers/
    │   ├── answerController.js         # POST /submit-answer logic
    │   ├── ingestController.js         # POST /ingest logic
    │   ├── quizGenerationController.js # POST /generate-quiz logic
    │   ├── quizRetrievalController.js  # GET /quiz logic
    │   └── studentController.js        # Adaptive difficulty + GET /student/:id/difficulty
    ├── middleware/
    │   ├── errorHandler.js    # Centralized error handler
    │   └── validate.js        # express-validator result handler
    ├── models/
    │   ├── ContentChunk.js    # Extracted text chunks from PDFs
    │   ├── QuizQuestion.js    # Generated quiz questions
    │   ├── SourceDocument.js  # Uploaded PDF metadata
    │   ├── StudentAnswer.js   # Individual answer records
    │   └── StudentSession.js  # Per-student difficulty state
    ├── routes/
    │   ├── answer.js          # POST /submit-answer
    │   ├── ingest.js          # POST /ingest
    │   ├── quiz.js            # POST /generate-quiz
    │   ├── quizRetrieval.js   # GET /quiz
    │   └── student.js         # GET /student/:student_id/difficulty
    ├── services/
    │   ├── llmService.js      # Groq API client + prompt
    │   └── pdfService.js      # PDF parsing + chunking
    └── utils/
        └── helpers.js         # ID generators
```

---

## Database Schema

### SourceDocument
| Field | Type | Description |
|---|---|---|
| `source_id` | String (unique) | e.g. `SRC_1700000000000_ABCD` |
| `title` | String | Original filename |
| `subject` | String | e.g. Math, English |
| `grade` | Number | Grade level 1–12 |
| `topic` | String | e.g. Shapes, Grammar |
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
| `selected_answer` | String | Student's answer |
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
| `file` | File | ✅ | PDF file to upload |
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

**curl example:**
```bash
curl -X POST http://localhost:3000/ingest \
  -F "file=@/path/to/doc.pdf" \
  -F "grade=1" \
  -F "subject=Math" \
  -F "topic=Shapes"
```

---

### `POST /generate-quiz`
Generate quiz questions from a previously ingested document using the LLM.

All chunks are processed in parallel. Each chunk produces at least 3 questions — one MCQ, one True/False, one Fill in the blank.

**Request body:**
```json
{ "source_id": "SRC_1700000000000_ABCD" }
```

**Response `200`:**
```json
{
  "source_id": "SRC_1700000000000_ABCD",
  "questions_generated": 42,
  "duplicates_skipped": 0
}
```

**curl example:**
```bash
curl -X POST http://localhost:3000/generate-quiz \
  -H "Content-Type: application/json" \
  -d '{"source_id": "SRC_1700000000000_ABCD"}'
```

---

### `GET /quiz`
Retrieve quiz questions with optional filters.

If `student_id` is provided without an explicit `difficulty`, the student's current adaptive difficulty is used automatically.

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `topic` | String | Case-insensitive regex match on topic |
| `difficulty` | String | `easy`, `medium`, or `hard` |
| `student_id` | String | Auto-resolves difficulty from student session |
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

**curl examples:**
```bash
# Filter by topic and difficulty
curl "http://localhost:3000/quiz?topic=shapes&difficulty=easy&limit=5"

# Auto-resolve difficulty from student session
curl "http://localhost:3000/quiz?student_id=S001&topic=shapes"
```

---

### `POST /submit-answer`
Submit a student's answer. Returns correctness and the student's updated difficulty level.

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
  "correct_streak": 2,
  "incorrect_streak": 0,
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

**curl example:**
```bash
curl http://localhost:3000/student/S001/difficulty
```

---

## Adaptive Difficulty Logic

Each student has a session that tracks their streak. Difficulty adjusts automatically as they answer questions.

| Event | Effect |
|---|---|
| 3 correct answers in a row | Difficulty increases: `easy → medium → hard` |
| 2 incorrect answers in a row | Difficulty decreases: `hard → medium → easy` |
| Any answer | Resets the opposing streak to 0 |

When `GET /quiz` is called with a `student_id` (and no explicit `difficulty` param), the system automatically serves questions at the student's current level.

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
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server will be running at `http://localhost:3000`. Verify with:
```bash
curl http://localhost:3000/health
# → { "status": "ok" }
```

---

## Testing with Postman

**Step 1 — Ingest a PDF**
- Method: `POST`
- URL: `http://localhost:3000/ingest`
- Body → `form-data`:
  - `file` → (type: File) select your PDF
  - `grade` → `1`
  - `subject` → `Math`
  - `topic` → `Shapes`
- Copy the `source_id` from the response

**Step 2 — Generate quiz questions**
- Method: `POST`
- URL: `http://localhost:3000/generate-quiz`
- Body → raw JSON: `{"source_id": "<your source_id>"}`

**Step 3 — Retrieve questions**
- Method: `GET`
- URL: `http://localhost:3000/quiz?difficulty=easy&limit=5`
- Copy a `question_id` from the response

**Step 4 — Submit an answer**
- Method: `POST`
- URL: `http://localhost:3000/submit-answer`
- Body → raw JSON:
```json
{
  "student_id": "S001",
  "question_id": "<question_id from step 3>",
  "selected_answer": "<your answer>"
}
```

**Step 5 — Check adaptive difficulty**
- Method: `GET`
- URL: `http://localhost:3000/student/S001/difficulty`

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `3000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/peblo_quiz` |
| `GROQ_API_KEY` | Groq API key for LLM calls | `gsk_...` |

See `.env.example` for the template. **Never commit your `.env` file.**
