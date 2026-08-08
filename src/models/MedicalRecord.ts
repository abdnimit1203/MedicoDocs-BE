import { Schema, model, Document } from "mongoose";

export type RelationshipType =
  | "Self"
  | "Father"
  | "Mother"
  | "Wife"
  | "Husband"
  | "Child"
  | "Sibling"
  | "Other";
export type CategoryType = "Disease" | "Condition" | "Specialty" | "General";
export type DocumentType = "visit" | "prescription" | "test_report";

export interface IImageRef {
  url?: string;
  thumbnail?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
}

export interface ITestResultItem {
  parameter: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  flag?: "NORMAL" | "HIGH" | "LOW" | "ABNORMAL" | string;
}

export interface IMedicineItem {
  name: string;
  strength?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

export interface IMedicalRecord extends Document {
  userId: string;
  patientName: string;
  relationship: RelationshipType;
  documentType: DocumentType;
  doctorName?: string;
  doctorSpecialty?: string;
  clinicLocation?: string;
  visitDate?: Date;
  prescriptionDate?: Date;
  // Denormalized sort key: visitDate ?? prescriptionDate ?? createdAt, computed at write time
  // by the records routes so the dashboard can sort by medical date with a plain index, not
  // a per-read aggregation coalesce.
  effectiveDate?: Date;
  category?: CategoryType | string;
  // Clinical diagnosis/notes/advice text ONLY. Structured medicines live in `medicines` below —
  // do not flatten medicine data back into this field.
  medicinesOrNotes?: string;
  imageRef?: IImageRef;
  medicines?: IMedicineItem[];

  // Additional fields for Test Reports (testsOrdered/followUpDate are legacy from the retired
  // "visit" document type — kept for backward compatibility with pre-migration records only)
  testName?: string;
  labName?: string;
  testsOrdered?: string;
  followUpDate?: Date;
  testResults?: ITestResultItem[];

  createdAt: Date;
  updatedAt: Date;
}

const MedicalRecordSchema = new Schema<IMedicalRecord>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    patientName: {
      type: String,
      required: [true, "Patient name is required."],
      trim: true,
    },
    relationship: {
      type: String,
      enum: [
        "Self",
        "Father",
        "Mother",
        "Wife",
        "Husband",
        "Child",
        "Sibling",
        "Other",
      ],
      default: "Self",
    },
    documentType: {
      type: String,
      // "visit" is retained for backward compatibility with pre-migration records only —
      // new records are rejected at the route layer (see records.ts) before they reach here.
      enum: ["visit", "prescription", "test_report"],
      default: "prescription",
      index: true,
    },
    doctorName: {
      type: String,
      trim: true,
      default: "",
    },
    doctorSpecialty: {
      type: String,
      trim: true,
      default: "",
    },
    clinicLocation: {
      type: String,
      trim: true,
      default: "",
    },
    visitDate: {
      type: Date,
      default: null,
    },
    prescriptionDate: {
      type: Date,
      default: null,
    },
    effectiveDate: {
      type: Date,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: "General",
    },
    medicinesOrNotes: {
      type: String,
      trim: true,
      default: "",
    },
    imageRef: {
      url: { type: String, default: "" },
      thumbnail: { type: String, default: "" },
      dimensions: {
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
      },
    },
    medicines: [
      {
        name: { type: String, trim: true, required: true },
        strength: { type: String, trim: true },
        frequency: { type: String, trim: true },
        duration: { type: String, trim: true },
        instructions: { type: String, trim: true },
      },
    ],

    // Extended fields
    testName: { type: String, trim: true, default: "" },
    labName: { type: String, trim: true, default: "" },
    testsOrdered: { type: String, trim: true, default: "" },
    followUpDate: { type: Date, default: null },
    testResults: [
      {
        parameter: { type: String, trim: true },
        value: { type: String, trim: true },
        unit: { type: String, trim: true },
        referenceRange: { type: String, trim: true },
        flag: { type: String, trim: true },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Compound index for user-isolated queries
MedicalRecordSchema.index({ userId: 1, documentType: 1, createdAt: -1 });
MedicalRecordSchema.index({ userId: 1, visitDate: -1 });
MedicalRecordSchema.index({ userId: 1, effectiveDate: -1 });

export const MedicalRecord = model<IMedicalRecord>(
  "MedicalRecord",
  MedicalRecordSchema,
);
