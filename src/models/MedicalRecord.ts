import { Schema, model, Document } from 'mongoose';

export type RelationshipType = 'Self' | 'Father' | 'Mother' | 'Wife' | 'Child' | 'Sibling' | 'Other';
export type CategoryType = 'Disease' | 'Condition' | 'Specialty' | 'General';
export type DocumentType = 'visit' | 'prescription' | 'test_report';

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
  flag?: 'NORMAL' | 'HIGH' | 'LOW' | 'ABNORMAL' | string;
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
  category?: CategoryType | string;
  medicinesOrNotes?: string;
  imageRef?: IImageRef;

  // Additional fields for Medical Visit & Test Reports
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
      required: [true, 'Patient name is required.'],
      trim: true,
    },
    relationship: {
      type: String,
      enum: ['Self', 'Father', 'Mother', 'Wife', 'Child', 'Sibling', 'Other'],
      default: 'Self',
    },
    documentType: {
      type: String,
      enum: ['visit', 'prescription', 'test_report'],
      default: 'visit',
      index: true,
    },
    doctorName: {
      type: String,
      trim: true,
      default: '',
    },
    doctorSpecialty: {
      type: String,
      trim: true,
      default: '',
    },
    clinicLocation: {
      type: String,
      trim: true,
      default: '',
    },
    visitDate: {
      type: Date,
      default: null,
    },
    prescriptionDate: {
      type: Date,
      default: null,
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
    },
    medicinesOrNotes: {
      type: String,
      trim: true,
      default: '',
    },
    imageRef: {
      url: { type: String, default: '' },
      thumbnail: { type: String, default: '' },
      dimensions: {
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
      },
    },

    // Extended fields
    testName: { type: String, trim: true, default: '' },
    labName: { type: String, trim: true, default: '' },
    testsOrdered: { type: String, trim: true, default: '' },
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
  }
);

// Compound index for user-isolated queries
MedicalRecordSchema.index({ userId: 1, documentType: 1, createdAt: -1 });
MedicalRecordSchema.index({ userId: 1, visitDate: -1 });

export const MedicalRecord = model<IMedicalRecord>('MedicalRecord', MedicalRecordSchema);
