# 🏥 MedicoDocs — Backend API

> **MedicoDocs Backend** is a high-performance Express & TypeScript API powering personal and family medical record management, user synchronization, ImageKit CDN integration, and Gemini AI prescription & test-report intelligence.

---

## 🚀 Live Demo & Deployment

* **Live API Server:** `[Coming Soon / Live Link Placeholder]`
* **Frontend Repository:** [https://github.com/abdnimit1203/MedicoDocs-FE](https://github.com/abdnimit1203/MedicoDocs-FE)
* **Backend Repository:** [https://github.com/abdnimit1203/MedicoDocs-BE](https://github.com/abdnimit1203/MedicoDocs-BE)

---

## 🌟 Key Features

* 🔐 **Firebase Admin Authentication Middleware:** Decodes and verifies Firebase Bearer JWT tokens on every protected route. Strictly isolates user records by `userId`.
* 🤖 **Gemini AI Intelligence Service:** Powered by Google Gen AI SDK (`@google/genai` with `gemini-3.6-flash`). Features structured JSON schema definitions for:
  * Medical Prescriptions (`analyzePrescriptionImage`) — including a structured `medicines[]` array (name, strength, frequency, duration, instructions)
  * Diagnostic Test Reports (`analyzeTestReportImage`)
* 💬 **AI Medical Assistant:** `POST /api/assistant/chat` answers natural-language questions (English/Bangla/mixed) grounded **only** in the authenticated user's own stored records. Simple keyword-based relevance scoring selects just the records relevant to each question (with a token/record budget) instead of dumping full history into every prompt — no vector DB, no chat history persisted. Hard safety rules prevent inventing facts, treating uncertain/unreadable fields as confirmed, or recommending medication changes.
* ⚡ **ImageKit Storage Integration:** Server-assisted authentication signature generation and Base64 CDN file uploads.
* 🗄️ **MongoDB & Mongoose:** `prescription` / `test_report` document types (legacy `visit` records supported read-only via `src/scripts/migrateVisitRecords.ts`) with compound indexes, including an `effectiveDate` index for medical-date-first sorting.

---

## 🛠️ Technology Stack

* **Runtime & Language:** Node.js, TypeScript, `tsx`
* **Framework:** Express.js
* **Database:** MongoDB & Mongoose
* **AI SDK:** `@google/genai` (Google Gen AI SDK with `gemini-3.6-flash`)
* **Auth:** Firebase Admin SDK
* **Storage:** ImageKit Node.js SDK

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the root of `MedicoDocs-BE`:

```env
PORT=5000
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/MedicoDocs
GEMINI_API_KEY=your_gemini_api_key
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="your_firebase_private_key"
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=your_imagekit_url_endpoint
```

---

## 🚀 Getting Started Locally

```bash
# 1. Install dependencies
npm install

# 2. Start development server with live reload
npm run dev

# 3. Build production bundle
npm run build
```

---

## 📡 Key API Endpoints

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `POST` | `/api/auth/sync` | Sync Firebase user profile to MongoDB | Yes |
| `GET` | `/api/records` | Get all user medical records (supports filters & search) | Yes |
| `POST` | `/api/records` | Create medical record (Visit, Prescription, Test Report) | Yes |
| `PUT` | `/api/records/:id` | Update medical record | Yes |
| `DELETE` | `/api/records/:id` | Delete medical record | Yes |
| `POST` | `/api/records/analyze-prescription` | Gemini 3.6 Flash AI prescription extraction | Yes |
| `POST` | `/api/records/analyze-test-report` | Gemini 3.6 Flash AI test report extraction | Yes |
| `POST` | `/api/records/upload-image` | Upload image to ImageKit CDN | Yes |
| `POST` | `/api/assistant/chat` | AI Medical Assistant — answers questions grounded in the user's own records only | Yes |

---

## 🧰 One-off Scripts

* `npx tsx src/scripts/migrateVisitRecords.ts` — reclassifies legacy `documentType: 'visit'` records into `prescription`/`test_report` and backfills `effectiveDate`. Dry-run by default; pass `--commit` to write. Not run automatically.

---

## 👤 Developer & Contact Information

* **Developer:** ABD
* **GitHub Profile:** [https://github.com/abdnimit1203](https://github.com/abdnimit1203)
* **Repository:** [https://github.com/abdnimit1203/MedicoDocs-BE](https://github.com/abdnimit1203/MedicoDocs-BE)
