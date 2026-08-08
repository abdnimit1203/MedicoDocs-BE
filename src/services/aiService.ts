import { GoogleGenAI, Type, Schema } from '@google/genai';
import { env } from '../config/env';

export interface IExtractedMedicine {
  name: string;
  strength?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface IPrescriptionAnalysisResult {
  doctorName?: string;
  doctorSpecialty?: string;
  clinicLocation?: string;
  patientName?: string;
  visitDate?: string;
  prescriptionDate?: string;
  category?: string;
  clinicalNotes?: string;
  medicines: IExtractedMedicine[];
  confidenceScore: number;
  uncertainFields: string[];
}

export interface IExtractedTestResultItem {
  parameter: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag?: string;
}

export interface ITestReportAnalysisResult {
  testName?: string;
  reportDate?: string;
  labName?: string;
  patientName?: string;
  summaryResult?: string;
  testResults: IExtractedTestResultItem[];
  confidenceScore: number;
  uncertainFields: string[];
}

// JSON Schema definition for Prescription Analysis
const prescriptionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    doctorName: { type: Type.STRING, description: "Doctor's full name if visible" },
    doctorSpecialty: { type: Type.STRING, description: "Medical specialty (e.g., Cardiology, Dermatology, General Medicine)" },
    clinicLocation: { type: Type.STRING, description: "Hospital or clinic name/location if visible" },
    patientName: { type: Type.STRING, description: "Patient's name if visible" },
    visitDate: { type: Type.STRING, description: "Date of visit in YYYY-MM-DD format if visible" },
    prescriptionDate: { type: Type.STRING, description: "Prescription date in YYYY-MM-DD format if visible" },
    category: { type: Type.STRING, description: "Document category: General, Disease, Condition, or Specialty" },
    clinicalNotes: { type: Type.STRING, description: "Diagnosis, medical condition, doctor advice, and clinical notes text" },
    medicines: {
      type: Type.ARRAY,
      description: "List of prescribed medicines extracted from the document",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Exact medicine name as written" },
          strength: { type: Type.STRING, description: "Dosage/strength (e.g. 500mg, 10ml, 5mg)" },
          frequency: { type: Type.STRING, description: "Frequency (e.g. Once daily, 1-0-1, 3 times/day)" },
          duration: { type: Type.STRING, description: "Duration (e.g. 5 days, 1 month, 7 days)" },
          instructions: { type: Type.STRING, description: "Special instructions (e.g. After food, Before bedtime)" },
        },
        required: ['name'],
      },
    },
    confidenceScore: { type: Type.NUMBER, description: "Overall confidence score between 0.0 and 1.0" },
    uncertainFields: {
      type: Type.ARRAY,
      description: "List of field names that were unreadable, handwritten, or low confidence",
      items: { type: Type.STRING },
    },
  },
  required: ['medicines', 'confidenceScore', 'uncertainFields'],
};

// JSON Schema definition for Diagnostic Test Report Analysis
const testReportSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    testName: { type: Type.STRING, description: "Overall test/report name (e.g., Complete Blood Count, Lipid Profile, Thyroid Panel)" },
    reportDate: { type: Type.STRING, description: "Report or collection date in YYYY-MM-DD format" },
    labName: { type: Type.STRING, description: "Diagnostic lab, hospital, or center name" },
    patientName: { type: Type.STRING, description: "Patient's name if visible" },
    summaryResult: { type: Type.STRING, description: "Summary conclusions, overall findings, or doctor notes" },
    testResults: {
      type: Type.ARRAY,
      description: "Extracted individual test parameter measurements",
      items: {
        type: Type.OBJECT,
        properties: {
          parameter: { type: Type.STRING, description: "Test parameter name (e.g., Hemoglobin, Glucose, Cholesterol)" },
          value: { type: Type.STRING, description: "Measured value (e.g., 14.2, 110, 200)" },
          unit: { type: Type.STRING, description: "Measurement unit (e.g., g/dL, mg/dL, mmol/L)" },
          referenceRange: { type: Type.STRING, description: "Normal reference range (e.g., 12.0 - 16.0)" },
          flag: { type: Type.STRING, description: "Indicator: NORMAL, HIGH, LOW, or ABNORMAL" },
        },
        required: ['parameter', 'value'],
      },
    },
    confidenceScore: { type: Type.NUMBER, description: "Overall confidence score between 0.0 and 1.0" },
    uncertainFields: {
      type: Type.ARRAY,
      description: "List of field names or parameters that were unreadable",
      items: { type: Type.STRING },
    },
  },
  required: ['testResults', 'confidenceScore', 'uncertainFields'],
};

async function processImageInput(imageInput: string): Promise<{ mimeType: string; base64Data: string }> {
  let mimeType = 'image/jpeg';
  let base64Data = '';

  if (imageInput.startsWith('data:')) {
    const parts = imageInput.split(';base64,');
    mimeType = parts[0].replace('data:', '');
    base64Data = parts[1];
  } else if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
    const response = await fetch(imageInput);
    if (!response.ok) {
      throw new Error(`Failed to fetch image from CDN (HTTP ${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    base64Data = buffer.toString('base64');

    const contentType = response.headers.get('content-type');
    if (contentType) mimeType = contentType;
  } else {
    base64Data = imageInput;
  }

  return { mimeType, base64Data };
}

export async function analyzePrescriptionImage(
  imageInput: string
): Promise<IPrescriptionAnalysisResult> {
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server. Please check GEMINI_API_KEY in .env.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const { mimeType, base64Data } = await processImageInput(imageInput);

  const promptText = `You are a high-precision medical prescription document OCR and intelligence parser for MedicoDocs.

CRITICAL SAFETY & ACCURACY RULES:
1. Extract ONLY text that is actually visible and readable in this prescription image.
2. NEVER invent missing medicine names, dosages, or patient info.
3. NEVER guess unreadable text as fact. If text is unreadable or uncertain, list the field name in 'uncertainFields' and mark the field value as "[Unclear - verify manually]".
4. NEVER recommend new medicines, treatments, or alter the doctor's original prescription.
5. Extract all visible prescribed medicines with their exact name, dosage/strength, frequency, duration, and instructions.
6. Extract doctor name, specialty, clinic/hospital, dates, and clinical notes/diagnosis.

Parse the image and return the structured JSON data strictly matching the requested schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: prescriptionSchema,
      },
    });

    const responseText = response.text;
    if (!responseText) throw new Error('Gemini API returned an empty response.');

    const parsedData: IPrescriptionAnalysisResult = JSON.parse(responseText);

    if (!Array.isArray(parsedData.medicines)) parsedData.medicines = [];
    if (!Array.isArray(parsedData.uncertainFields)) parsedData.uncertainFields = [];
    if (typeof parsedData.confidenceScore !== 'number') parsedData.confidenceScore = 0.85;

    return parsedData;
  } catch (error: any) {
    console.error('Gemini AI Prescription Error:', error.message || error);
    throw new Error(`Prescription analysis failed: ${error.message || 'Unknown error'}`);
  }
}

export async function analyzeTestReportImage(
  imageInput: string
): Promise<ITestReportAnalysisResult> {
  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server. Please check GEMINI_API_KEY in .env.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const { mimeType, base64Data } = await processImageInput(imageInput);

  const promptText = `You are an expert diagnostic test report OCR and laboratory intelligence parser for MedicoDocs.

CRITICAL SAFETY & ACCURACY RULES:
1. Extract ONLY measurement parameters, values, reference ranges, and lab info actually visible in this diagnostic report.
2. NEVER invent missing test values or reference ranges.
3. NEVER guess unreadable test names or numbers as fact. Mark uncertain fields in 'uncertainFields'.
4. Extract test name (e.g. Complete Blood Count, Lipid Profile, Thyroid Test), lab/hospital name, report date, and summary findings.
5. Extract individual test parameters with their measured value, unit, reference range, and flag (NORMAL, HIGH, LOW, or ABNORMAL).

Parse the image and return the structured JSON data strictly matching the requested schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: testReportSchema,
      },
    });

    const responseText = response.text;
    if (!responseText) throw new Error('Gemini API returned an empty response.');

    const parsedData: ITestReportAnalysisResult = JSON.parse(responseText);

    if (!Array.isArray(parsedData.testResults)) parsedData.testResults = [];
    if (!Array.isArray(parsedData.uncertainFields)) parsedData.uncertainFields = [];
    if (typeof parsedData.confidenceScore !== 'number') parsedData.confidenceScore = 0.85;

    return parsedData;
  } catch (error: any) {
    console.error('Gemini AI Test Report Error:', error.message || error);
    throw new Error(`Test report analysis failed: ${error.message || 'Unknown error'}`);
  }
}
