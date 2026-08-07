import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/auth';
import { MedicalRecord } from '../models/MedicalRecord';

const router = Router();

// All record routes require valid authentication
router.use(requireAuth);

/**
 * POST /api/records
 * Create a new medical record (userId strictly derived from req.user.uid)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const {
      patientName,
      relationship,
      doctorName,
      doctorSpecialty,
      clinicLocation,
      visitDate,
      prescriptionDate,
      category,
      medicinesOrNotes,
      imageRef,
    } = req.body;

    if (!patientName || typeof patientName !== 'string' || !patientName.trim()) {
      res.status(400).json({
        success: false,
        error: { message: 'patientName is required and must be a valid string.' },
      });
      return;
    }

    const record = new MedicalRecord({
      userId, // STRICT USER ISOLATION
      patientName: patientName.trim(),
      relationship: relationship || 'Self',
      doctorName: doctorName ? String(doctorName).trim() : '',
      doctorSpecialty: doctorSpecialty ? String(doctorSpecialty).trim() : '',
      clinicLocation: clinicLocation ? String(clinicLocation).trim() : '',
      visitDate: visitDate ? new Date(visitDate) : null,
      prescriptionDate: prescriptionDate ? new Date(prescriptionDate) : null,
      category: category ? String(category).trim() : 'General',
      medicinesOrNotes: medicinesOrNotes ? String(medicinesOrNotes).trim() : '',
      imageRef: imageRef || { url: '', thumbnail: '', dimensions: { width: 0, height: 0 } },
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
 * List all medical records for the authenticated user (supports search & filters)
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const { relationship, category, doctor, search, year, month } = req.query;

    const filter: any = { userId };

    if (relationship && relationship !== 'All') {
      filter.relationship = String(relationship);
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
        { category: searchRegex },
        { medicinesOrNotes: searchRegex },
        { clinicLocation: searchRegex },
      ];
    }

    // Filter by year/month if provided
    if (year) {
      const yearNum = parseInt(String(year), 10);
      if (!isNaN(yearNum)) {
        let startDate: Date;
        let endDate: Date;

        if (month !== undefined && month !== 'All') {
          const monthNum = parseInt(String(month), 10); // 0-indexed or 1-indexed handling
          const actualMonth = monthNum >= 1 && monthNum <= 12 ? monthNum - 1 : 0;
          startDate = new Date(yearNum, actualMonth, 1);
          endDate = new Date(yearNum, actualMonth + 1, 0, 23, 59, 59, 999);
        } else {
          startDate = new Date(yearNum, 0, 1);
          endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999);
        }

        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { visitDate: { $gte: startDate, $lte: endDate } },
            { prescriptionDate: { $gte: startDate, $lte: endDate } },
            { createdAt: { $gte: startDate, $lte: endDate } },
          ],
        });
      }
    }

    const records = await MedicalRecord.find(filter).sort({ visitDate: -1, createdAt: -1 });

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
 * Retrieve a single record belonging to the authenticated user
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;
    const record = await MedicalRecord.findOne({ _id: req.params.id, userId });

    if (!record) {
      res.status(404).json({
        success: false,
        error: { message: 'Record not found or access denied.' },
      });
      return;
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    console.error('Error fetching single record:', error.message || error);
    res.status(404).json({
      success: false,
      error: { message: 'Record not found or invalid ID.' },
    });
  }
});

/**
 * PUT /api/records/:id
 * Update an existing record belonging to the authenticated user
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;

    const record = await MedicalRecord.findOne({ _id: req.params.id, userId });

    if (!record) {
      res.status(404).json({
        success: false,
        error: { message: 'Record not found or access denied.' },
      });
      return;
    }

    const {
      patientName,
      relationship,
      doctorName,
      doctorSpecialty,
      clinicLocation,
      visitDate,
      prescriptionDate,
      category,
      medicinesOrNotes,
      imageRef,
    } = req.body;

    if (patientName !== undefined) record.patientName = String(patientName).trim();
    if (relationship !== undefined) record.relationship = relationship;
    if (doctorName !== undefined) record.doctorName = String(doctorName).trim();
    if (doctorSpecialty !== undefined) record.doctorSpecialty = String(doctorSpecialty).trim();
    if (clinicLocation !== undefined) record.clinicLocation = String(clinicLocation).trim();
    if (visitDate !== undefined) record.visitDate = visitDate ? new Date(visitDate) : undefined;
    if (prescriptionDate !== undefined)
      record.prescriptionDate = prescriptionDate ? new Date(prescriptionDate) : undefined;
    if (category !== undefined) record.category = String(category).trim();
    if (medicinesOrNotes !== undefined) record.medicinesOrNotes = String(medicinesOrNotes).trim();
    if (imageRef !== undefined) record.imageRef = { ...record.imageRef, ...imageRef };

    // NEVER ALLOW MUTATING userId
    record.userId = userId;

    await record.save();

    res.json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    console.error('Error updating record:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update record.' },
    });
  }
});

/**
 * DELETE /api/records/:id
 * Delete a medical record belonging to the authenticated user
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.uid;

    const result = await MedicalRecord.findOneAndDelete({ _id: req.params.id, userId });

    if (!result) {
      res.status(404).json({
        success: false,
        error: { message: 'Record not found or access denied.' },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Medical record deleted successfully.',
    });
  } catch (error: any) {
    console.error('Error deleting record:', error.message || error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete medical record.' },
    });
  }
});

export default router;
