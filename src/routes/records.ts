import { Router, Request, Response } from 'express';
import ImageKit from 'imagekit';
import { requireAuth } from '../middlewares/auth';
import { MedicalRecord } from '../models/MedicalRecord';
import { analyzePrescriptionImage, analyzeTestReportImage } from '../services/aiService';

const router = Router();

// All record routes require valid authentication
router.use(requireAuth);

/**
 * Computes the denormalized sort key: visitDate ?? prescriptionDate ?? now.
 * Written once at create/update time so GET / can sort with a plain indexed
 * field instead of recomputing a coalesce on every read.
 */
function computeEffectiveDate(visitDate?: string, prescriptionDate?: string): Date {
  if (visitDate) return new Date(visitDate);
  if (prescriptionDate) return new Date(prescriptionDate);
  return new Date();
}

/**
 * POST /api/records/analyze-prescription
 * Gemini AI Prescription Image Analysis (Requires Auth)
 */
router.post('/analyze-prescription', async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageUrl, file } = req.body;
    const imageInput = imageUrl || file;

    if (!imageInput) {
      res.status(400).json({
        success: false,
        error: { message: 'Image URL or base64 image data is required for AI analysis.' },
      });
      return;
    }

    const analysisResult = await analyzePrescriptionImage(imageInput);

    res.json({
      success: true,
      data: analysisResult,
    });
  } catch (error: any) {
    console.error('Prescription AI analysis route error:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to analyze prescription with Gemini AI.' },
    });
  }
});

/**
 * POST /api/records/analyze-test-report
 * Gemini AI Diagnostic Test Report Analysis (Requires Auth)
 */
router.post('/analyze-test-report', async (req: Request, res: Response): Promise<void> => {
  try {
    const { imageUrl, file } = req.body;
    const imageInput = imageUrl || file;

    if (!imageInput) {
      res.status(400).json({
        success: false,
        error: { message: 'Image URL or base64 image data is required for AI analysis.' },
      });
      return;
    }

    const analysisResult = await analyzeTestReportImage(imageInput);

    res.json({
      success: true,
      data: analysisResult,
    });
  } catch (error: any) {
    console.error('Test Report AI analysis route error:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'Failed to analyze test report with Gemini AI.' },
    });
  }
});

/**
 * Helper to initialize ImageKit SDK using environment variables
 */
function getImageKit(): ImageKit | null {
  const publicKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || process.env.IMAGEKIT_PUBLIC_KEY || '';
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY || '';
  const urlEndpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || process.env.IMAGEKIT_URL_ENDPOINT || '';

  if (!publicKey || !privateKey || !urlEndpoint) {
    return null;
  }

  return new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  });
}

/**
 * GET /api/records/imagekit-auth
 * Generate secure authentication signature for client-side ImageKit upload
 */
router.get('/imagekit-auth', (req: Request, res: Response): void => {
  try {
    const ik = getImageKit();
    if (!ik) {
      res.status(503).json({
        success: false,
        error: { message: 'ImageKit credentials not configured on server.' },
      });
      return;
    }

    const authParams = ik.getAuthenticationParameters();
    res.json({
      success: true,
      data: authParams,
    });
  } catch (error: any) {
    console.error('Error generating ImageKit auth parameters:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to generate ImageKit authentication parameters.' },
    });
  }
});

/**
 * POST /api/records/upload-image
 * Backend-assisted ImageKit base64 image upload fallback
 */
router.post('/upload-image', async (req: Request, res: Response): Promise<void> => {
  try {
    const { file, fileName } = req.body;
    if (!file) {
      res.status(400).json({
        success: false,
        error: { message: 'Base64 image string is required.' },
      });
      return;
    }

    const ik = getImageKit();
    if (!ik) {
      res.status(503).json({
        success: false,
        error: { message: 'ImageKit credentials not configured on server.' },
      });
      return;
    }

    const uploadResponse = await ik.upload({
      file,
      fileName: fileName || `medical_doc_${Date.now()}.jpg`,
      folder: `/medicodocs/user_${req.user!.uid}`,
    });

    res.json({
      success: true,
      data: {
        url: uploadResponse.url,
        thumbnail: uploadResponse.thumbnailUrl || uploadResponse.url,
        dimensions: {
          width: uploadResponse.width || 0,
          height: uploadResponse.height || 0,
        },
      },
    });
  } catch (error: any) {
    console.error('ImageKit upload error:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to upload image to ImageKit.' },
    });
  }
});

/**
 * POST /api/records
 * Create a new medical record (Prescription or Test Report)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const {
      patientName,
      relationship,
      documentType,
      doctorName,
      doctorSpecialty,
      clinicLocation,
      visitDate,
      prescriptionDate,
      category,
      medicinesOrNotes,
      imageRef,
      medicines,
      testName,
      labName,
      testsOrdered,
      followUpDate,
      testResults,
    } = req.body;

    if (!patientName || typeof patientName !== 'string' || !patientName.trim()) {
      res.status(400).json({
        success: false,
        error: { message: 'patientName is required and must be a valid string.' },
      });
      return;
    }

    if (documentType === 'visit') {
      res.status(400).json({
        success: false,
        error: { message: "Visit records are no longer supported. Use 'prescription' or 'test_report'." },
      });
      return;
    }

    const record = new MedicalRecord({
      userId,
      patientName: patientName.trim(),
      relationship: relationship || 'Self',
      documentType: documentType || 'prescription',
      doctorName: doctorName ? String(doctorName).trim() : '',
      doctorSpecialty: doctorSpecialty ? String(doctorSpecialty).trim() : '',
      clinicLocation: clinicLocation ? String(clinicLocation).trim() : '',
      visitDate: visitDate ? new Date(visitDate) : null,
      prescriptionDate: prescriptionDate ? new Date(prescriptionDate) : null,
      effectiveDate: computeEffectiveDate(visitDate, prescriptionDate),
      category: category ? String(category).trim() : 'General',
      medicinesOrNotes: medicinesOrNotes ? String(medicinesOrNotes).trim() : '',
      imageRef: imageRef || { url: '', thumbnail: '', dimensions: { width: 0, height: 0 } },
      medicines: Array.isArray(medicines) ? medicines : [],
      testName: testName ? String(testName).trim() : '',
      labName: labName ? String(labName).trim() : '',
      testsOrdered: testsOrdered ? String(testsOrdered).trim() : '',
      followUpDate: followUpDate ? new Date(followUpDate) : null,
      testResults: Array.isArray(testResults) ? testResults : [],
    });

    await record.save();

    res.status(201).json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    console.error('Error creating medical record:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to create medical record.' },
    });
  }
});

/**
 * GET /api/records
 * List all medical records for the authenticated user
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const { relationship, category, documentType, doctor, search, year, month } = req.query;

    const filter: any = { userId };

    if (relationship && relationship !== 'All') {
      filter.relationship = String(relationship);
    }

    if (documentType && documentType !== 'All') {
      filter.documentType = String(documentType);
    }

    if (category && category !== 'All') {
      filter.category = String(category);
    }

    if (doctor && doctor !== 'All') {
      filter.doctorName = String(doctor);
    }

    if (search) {
      const searchRegex = new RegExp(String(search).trim(), 'i');
      filter.$or = [
        { patientName: searchRegex },
        { doctorName: searchRegex },
        { doctorSpecialty: searchRegex },
        { clinicLocation: searchRegex },
        { medicinesOrNotes: searchRegex },
        { category: searchRegex },
        { testName: searchRegex },
        { labName: searchRegex },
      ];
    }

    if (year) {
      const yearNum = parseInt(String(year), 10);
      if (!isNaN(yearNum)) {
        const startOfYear = new Date(Date.UTC(yearNum, 0, 1));
        const endOfYear = new Date(Date.UTC(yearNum, 11, 31, 23, 59, 59, 999));

        if (month && month !== 'All') {
          const monthNum = parseInt(String(month), 10);
          if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
            const startOfMonth = new Date(Date.UTC(yearNum, monthNum - 1, 1));
            const endOfMonth = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));
            filter.createdAt = { $gte: startOfMonth, $lte: endOfMonth };
          }
        } else {
          filter.createdAt = { $gte: startOfYear, $lte: endOfYear };
        }
      }
    }

    const records = await MedicalRecord.find(filter).sort({ effectiveDate: -1, createdAt: -1 });

    res.json({
      success: true,
      count: records.length,
      data: records,
    });
  } catch (error: any) {
    console.error('Error fetching medical records:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch medical records.' },
    });
  }
});

/**
 * GET /api/records/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const record = await MedicalRecord.findOne({ _id: req.params.id, userId });

    if (!record) {
      res.status(404).json({
        success: false,
        error: { message: 'Medical record not found or unauthorized.' },
      });
      return;
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    console.error('Error fetching record by id:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch record details.' },
    });
  }
});

/**
 * PUT /api/records/:id
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const {
      patientName,
      relationship,
      documentType,
      doctorName,
      doctorSpecialty,
      clinicLocation,
      visitDate,
      prescriptionDate,
      category,
      medicinesOrNotes,
      imageRef,
      medicines,
      testName,
      labName,
      testsOrdered,
      followUpDate,
      testResults,
    } = req.body;

    // Note: unlike POST, PUT does not reject documentType === 'visit' — the frontend always
    // echoes back a record's existing documentType on save, so rejecting here would block
    // editing/re-saving any straggler pre-migration visit record. New visit records are
    // already prevented at creation time (see the POST / handler above).

    const updateFields: any = {};
    if (patientName !== undefined) updateFields.patientName = String(patientName).trim();
    if (relationship !== undefined) updateFields.relationship = relationship;
    if (documentType !== undefined) updateFields.documentType = documentType;
    if (doctorName !== undefined) updateFields.doctorName = String(doctorName).trim();
    if (doctorSpecialty !== undefined) updateFields.doctorSpecialty = String(doctorSpecialty).trim();
    if (clinicLocation !== undefined) updateFields.clinicLocation = String(clinicLocation).trim();
    if (visitDate !== undefined) updateFields.visitDate = visitDate ? new Date(visitDate) : null;
    if (prescriptionDate !== undefined) updateFields.prescriptionDate = prescriptionDate ? new Date(prescriptionDate) : null;
    if (visitDate !== undefined || prescriptionDate !== undefined) {
      updateFields.effectiveDate = computeEffectiveDate(visitDate, prescriptionDate);
    }
    if (category !== undefined) updateFields.category = String(category).trim();
    if (medicinesOrNotes !== undefined) updateFields.medicinesOrNotes = String(medicinesOrNotes).trim();
    if (imageRef !== undefined) updateFields.imageRef = imageRef;
    if (medicines !== undefined) updateFields.medicines = Array.isArray(medicines) ? medicines : [];

    if (testName !== undefined) updateFields.testName = String(testName).trim();
    if (labName !== undefined) updateFields.labName = String(labName).trim();
    if (testsOrdered !== undefined) updateFields.testsOrdered = String(testsOrdered).trim();
    if (followUpDate !== undefined) updateFields.followUpDate = followUpDate ? new Date(followUpDate) : null;
    if (testResults !== undefined) updateFields.testResults = Array.isArray(testResults) ? testResults : [];

    const record = await MedicalRecord.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!record) {
      res.status(404).json({
        success: false,
        error: { message: 'Medical record not found or unauthorized.' },
      });
      return;
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    console.error('Error updating medical record:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update medical record.' },
    });
  }
});

/**
 * DELETE /api/records/:id
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const record = await MedicalRecord.findOneAndDelete({ _id: req.params.id, userId });

    if (!record) {
      res.status(404).json({
        success: false,
        error: { message: 'Medical record not found or unauthorized.' },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Medical record deleted successfully.',
    });
  } catch (error: any) {
    console.error('Error deleting medical record:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete medical record.' },
    });
  }
});

export default router;
