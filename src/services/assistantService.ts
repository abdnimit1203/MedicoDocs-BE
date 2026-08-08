import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';

/**
 * Minimal, decoupled shape of what the assistant needs from a MedicalRecord —
 * intentionally not importing the Mongoose model/Document type here, same as
 * aiService.ts stays free of any MedicalRecord dependency. Keeps this file a
 * pure Gemini I/O service.
 */
export interface IAssistantContextRecord {
  documentType?: string;
  patientName?: string;
  relationship?: string;
  doctorName?: string;
  doctorSpecialty?: string;
  clinicLocation?: string;
  visitDate?: Date | string | null;
  prescriptionDate?: Date | string | null;
  effectiveDate?: Date | string | null;
  createdAt?: Date | string;
  medicinesOrNotes?: string;
  medicines?: {
    name: string;
    strength?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }[];
  testName?: string;
  labName?: string;
  testResults?: {
    parameter: string;
    value: string;
    unit?: string;
    referenceRange?: string;
    flag?: string;
  }[];
}

export interface IAnswerResult {
  answer: string;
  recordsConsidered: number;
  recordsAvailable: number;
  wasLimited: boolean;
}

const SYSTEM_PROMPT = `You are the MedicoDocs AI Medical Assistant. You answer questions about ONE specific user's own stored medical records inside the MedicoDocs app — you are not a general medical chatbot.

You will be given a block of that user's own MedicoDocs records (prescriptions and test reports they scanned or entered themselves) followed by their question. The records shown may be a relevant/recent subset of everything they have stored, not necessarily all of it — a note will say so when that's the case. Follow these rules strictly:

GROUNDING
- Only use information that is explicitly present in the supplied records. Never invent a diagnosis, medicine, dosage, test result, date, doctor, clinic, or any other medical history detail that is not in the records.
- If the records shown do not contain the answer to the question, say so clearly and plainly instead of guessing or answering generically. If the user has no records, or none relevant to the question, say that.
- A field with the exact value "[Unclear - verify manually]", or an empty/missing field, is NOT a confirmed fact. If asked about such a field, explicitly tell the user it could not be reliably read from their document and should be verified against the original image in the app — never state it as if it were a normal recorded value.
- If a context note indicates only a relevant/recent subset of records was shown, you may mention that your answer is based on the relevant available records rather than the user's full history.

SOURCE CITATION
- When your answer comes from a specific record, mention its date and type where available, e.g. "According to your prescription dated 12 July 2026..." or "Your test report from 5 August 2026 shows...". Never invent a date — if a record has no date, say "an undated record" rather than making one up.

MEDICAL SAFETY — HARD RULES, NEVER BREAK THESE
- Never tell the user to start, stop, increase, decrease, substitute, or otherwise change any medication or dosage, under any circumstances.
- Never rewrite, reinterpret, or issue a new version of a doctor's prescription.
- Do not present your own interpretation as if it were a doctor's diagnosis.
- You may explain what is recorded (e.g. what dosage/frequency was written for a medicine, or what a lab parameter like Hemoglobin generally measures), but always clearly separate general medical information from the user's own actual recorded data.
- If the user describes symptoms that could be serious or urgent, do not attempt to diagnose or reassure them — advise them to consult an appropriate healthcare professional or seek medical care.

TONE & LANGUAGE
- Respond naturally in whichever language(s) the user's question is written in — English, Bangla, or a natural mix of both — matching their style.
- When relevant, make clear you are answering from the user's own stored MedicoDocs records, not from general medical knowledge, so the two are never confused.
- Be concise and directly answer what was asked.`;

// ---- Context budget (kept intentionally small and simple — no embeddings/vector search) ----
const MAX_TARGETED_RECORDS = 6;
const MAX_BROAD_RECORDS = 12;
const MAX_CONTEXT_CHARS = 8000; // ~2000 tokens at a rough 4 chars/token estimate
const MIN_TOKEN_LENGTH = 3;

const BROAD_INTENT_PATTERNS = [
  'summar',
  'overview',
  'entire history',
  'full history',
  'my history',
  'medical history',
  'everything',
  'all my records',
  'all records',
  'সারাংশ', // "summary" (Bangla)
  'ইতিহাস', // "history" (Bangla)
];

function formatDate(value?: Date | string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function serializeRecord(record: IAssistantContextRecord, index: number): string {
  const lines: string[] = [];
  const dateLabel =
    formatDate(record.visitDate) ||
    formatDate(record.prescriptionDate) ||
    formatDate(record.effectiveDate) ||
    formatDate(record.createdAt);
  const typeLabel = record.documentType === 'test_report' ? 'Test Report' : 'Prescription';

  lines.push(`Record #${index + 1} — ${typeLabel} — Date: ${dateLabel || 'not recorded'}`);
  if (record.patientName) lines.push(`Patient: ${record.patientName}${record.relationship ? ` (${record.relationship})` : ''}`);
  if (record.doctorName) lines.push(`Doctor: ${record.doctorName}${record.doctorSpecialty ? ` (${record.doctorSpecialty})` : ''}`);
  if (record.clinicLocation) lines.push(`Clinic/Hospital: ${record.clinicLocation}`);

  if (record.documentType === 'test_report') {
    if (record.testName) lines.push(`Test: ${record.testName}`);
    if (record.labName) lines.push(`Lab: ${record.labName}`);
    if (Array.isArray(record.testResults) && record.testResults.length > 0) {
      lines.push('Test Results:');
      for (const tr of record.testResults) {
        const ref = tr.referenceRange ? ` (Ref: ${tr.referenceRange})` : '';
        const flag = tr.flag ? ` [${tr.flag}]` : '';
        lines.push(`  - ${tr.parameter}: ${tr.value}${tr.unit ? ' ' + tr.unit : ''}${ref}${flag}`);
      }
    }
  } else if (Array.isArray(record.medicines) && record.medicines.length > 0) {
    lines.push('Medicines:');
    for (const m of record.medicines) {
      const dosage = [m.strength, m.frequency, m.duration].filter(Boolean).join(', ');
      const instructions = m.instructions ? ` — ${m.instructions}` : '';
      lines.push(`  - ${m.name}${dosage ? ` (${dosage})` : ''}${instructions}`);
    }
  }

  if (record.medicinesOrNotes && record.medicinesOrNotes.trim()) {
    lines.push(`Clinical Notes: ${record.medicinesOrNotes.trim()}`);
  }

  return lines.join('\n');
}

// Common English function words — free-text clinical notes are ordinary sentences
// ("fever for 3 days", "estimations were carried out by..."), so without this filter
// a word like "for" or "were" in a question would false-positive match almost any
// record's notes and defeat the whole point of relevance scoring.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'and', 'or', 'but', 'for', 'nor', 'of', 'in', 'on', 'at', 'to', 'from',
  'by', 'with', 'about', 'as', 'into', 'over', 'after', 'before',
  'my', 'me', 'i', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those',
  'what', 'who', 'whom', 'which', 'when', 'where', 'why', 'how',
  'do', 'does', 'did', 'has', 'have', 'had', 'can', 'could', 'will', 'would',
  'should', 'shall', 'may', 'might', 'must', 'not', 'any', 'all', 'some',
  'show', 'tell', 'give', 'get', 'know', 'please', 'recent', 'recently', 'last',
]);

function tokenizeQuestion(question: string): string[] {
  // Latin + Bangla unicode ranges, so keyword matching works for both scripts.
  const matches = question.toLowerCase().match(/[a-z0-9ঀ-৿]+/g) || [];
  return matches.filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

function buildHaystack(record: IAssistantContextRecord): string {
  const parts: string[] = [
    record.documentType === 'test_report' ? 'test report lab result' : 'prescription medicine',
    record.doctorName || '',
    record.doctorSpecialty || '',
    record.clinicLocation || '',
    record.testName || '',
    record.labName || '',
    record.medicinesOrNotes || '',
  ];
  if (Array.isArray(record.medicines)) {
    for (const m of record.medicines) parts.push(m.name);
  }
  if (Array.isArray(record.testResults)) {
    for (const tr of record.testResults) parts.push(tr.parameter);
  }
  return parts.join(' ').toLowerCase();
}

function isBroadQuestion(questionLower: string): boolean {
  return BROAD_INTENT_PATTERNS.some((p) => questionLower.includes(p));
}

/**
 * Cheap English+Bangla heuristic — only used when no keyword scored a match at all.
 * Deliberately plain substring matching (no \b word-boundary anchors): several of
 * these are meant as prefixes ("prescri" should match "prescribed"/"prescriptions"),
 * and \b(prescri)\b would require a boundary immediately after "prescri", which
 * never occurs mid-word — that anchoring bug previously made this always miss.
 */
function impliedDocType(questionLower: string): 'prescription' | 'test_report' | null {
  const mentionsTest = /test|report|result|lab|blood sugar|glucose|count|cholesterol/.test(questionLower) || /টেস্ট|রিপোর্ট|পরীক্ষা/.test(questionLower);
  const mentionsRx = /prescri|medicine|medication|drug|dose|dosage/.test(questionLower) || /ওষুধ|প্রেসক্রিপশন|মেডিসিন/.test(questionLower);
  if (mentionsTest && !mentionsRx) return 'test_report';
  if (mentionsRx && !mentionsTest) return 'prescription';
  return null;
}

interface ISelectionResult {
  selected: IAssistantContextRecord[];
  totalAvailable: number;
  wasLimited: boolean;
}

/**
 * Simple server-side relevance selection — substring/keyword scoring over the
 * already-fetched records, no embeddings/vector search/RAG framework. Records
 * arrive pre-sorted by recency (effectiveDate desc) from the MongoDB query,
 * so recency is the natural tiebreaker throughout.
 */
export function selectRelevantRecords(question: string, records: IAssistantContextRecord[]): ISelectionResult {
  const totalAvailable = records.length;
  if (totalAvailable === 0) {
    return { selected: [], totalAvailable, wasLimited: false };
  }

  const questionLower = question.toLowerCase();
  const broad = isBroadQuestion(questionLower);
  const maxRecords = broad ? MAX_BROAD_RECORDS : MAX_TARGETED_RECORDS;

  let candidates: IAssistantContextRecord[];

  if (broad) {
    // Broad/summary questions: most recent records, no keyword filtering needed.
    candidates = records;
  } else {
    const tokens = tokenizeQuestion(question);
    const scored = records
      .map((record) => {
        const haystack = buildHaystack(record);
        const score = tokens.reduce((acc, t) => acc + (haystack.includes(t) ? 1 : 0), 0);
        return { record, score };
      })
      .filter((s) => s.score > 0);

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score); // stable sort: ties keep their recency order
      candidates = scored.map((s) => s.record);
    } else {
      // Nothing matched by keyword. If the question at least hints at a document
      // type ("recent prescriptions", "test results"), fall back to that type's
      // most recent records. Otherwise send NOTHING rather than guessing — e.g.
      // "What is Alcet?" with no matching record should not pull in unrelated
      // history just to have something to show.
      const docType = impliedDocType(questionLower);
      candidates = docType ? records.filter((r) => r.documentType === docType) : [];
    }
  }

  const selected = candidates.slice(0, maxRecords);
  let wasLimited = candidates.length > selected.length;

  // Enforce a total character budget by dropping whole records from the tail —
  // never truncate inside a record's serialized text/values.
  let budgeted = selected;
  while (budgeted.length > 1) {
    const size = budgeted.map((r, i) => serializeRecord(r, i)).join('\n\n---\n\n').length;
    if (size <= MAX_CONTEXT_CHARS) break;
    budgeted = budgeted.slice(0, -1);
    wasLimited = true;
  }

  return { selected: budgeted, totalAvailable, wasLimited };
}

export async function answerMedicalQuestion(
  question: string,
  records: IAssistantContextRecord[]
): Promise<IAnswerResult> {
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server. Please check GEMINI_API_KEY in .env.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const { selected, totalAvailable, wasLimited } = selectRelevantRecords(question, records);

  const contextNote = wasLimited
    ? `\n\n(CONTEXT NOTE: Showing ${selected.length} of ${totalAvailable} total stored record(s) — the ones most relevant/recent to this question.)`
    : '';

  const userPrompt =
    selected.length > 0
      ? `USER'S MEDICODOCS RECORDS (${selected.length} shown, most relevant/recent first):\n\n${selected
          .map((r, i) => serializeRecord(r, i))
          .join('\n\n---\n\n')}${contextNote}\n\nUSER'S QUESTION: ${question}`
      : totalAvailable > 0
        ? `The user has ${totalAvailable} stored record(s) in MedicoDocs, but none of them appear relevant to this specific question.\n\nUSER'S QUESTION: ${question}`
        : `The user currently has no stored medical records in MedicoDocs.\n\nUSER'S QUESTION: ${question}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      config: {
        systemInstruction: SYSTEM_PROMPT,
      },
    });

    const answer = response.text;
    if (!answer) throw new Error('Gemini API returned an empty response.');
    return {
      answer: answer.trim(),
      recordsConsidered: selected.length,
      recordsAvailable: totalAvailable,
      wasLimited,
    };
  } catch (error: any) {
    console.error('Gemini AI Assistant Error:', error.message || error);
    throw new Error(`Assistant response failed: ${error.message || 'Unknown error'}`);
  }
}
