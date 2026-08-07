import { Schema, model, Document } from 'mongoose';

export type RelationshipType = 'Self' | 'Father' | 'Mother' | 'Wife' | 'Child' | 'Sibling' | 'Other';
export type CategoryType = 'Disease' | 'Condition' | 'Specialty' | 'General';

export interface IImageRef {
  url?: string;
  thumbnail?: string;
  dimensions?: {
    width?: number;
    height?: number;
  };
}

export interface IMedicalRecord extends Document {
  userId: string;
  patientName: string;
  relationship: RelationshipType;
  doctorName?: string;
  doctorSpecialty?: string;
  clinicLocation?: string;
  visitDate?: Date;
  prescriptionDate?: Date;
  category?: CategoryType | string;
  medicinesOrNotes?: string;
  imageRef?: IImageRef;
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
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient user-isolated queries sorted by visit/prescription date
MedicalRecordSchema.index({ userId: 1, visitDate: -1 });
MedicalRecordSchema.index({ userId: 1, createdAt: -1 });

export const MedicalRecord = model<IMedicalRecord>('MedicalRecord', MedicalRecordSchema);
