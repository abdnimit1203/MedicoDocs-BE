/**
 * One-off migration for the prescription-first simplification.
 *
 * NOT wired into index.ts or any route — run manually, by hand, when you're
 * ready:
 *
 *   npx tsx src/scripts/migrateVisitRecords.ts            # dry run (default, no writes)
 *   npx tsx src/scripts/migrateVisitRecords.ts --commit    # actually writes changes
 *
 * BEFORE running with --commit against any real database:
 *   1. Check which MONGO_URI / .env is active — this script connects to
 *      whatever connectDB() resolves, and prints the database name it
 *      connected to before doing anything else. Read that line.
 *   2. Back up the `medicalrecords` collection first (mongodump, or an
 *      Atlas snapshot). The medicine-text split below (Pass A) is lossy by
 *      design — it cannot be perfectly undone from the post-migration data.
 *   3. Run dry-run first (the default) and read the logged plan before ever
 *      passing --commit, ideally against a restored local/dev copy of the
 *      database rather than production.
 *
 * What it does:
 *   Pass A — reclassifies documentType: 'visit' records into 'prescription'
 *            or 'test_report', and for ones becoming 'prescription', tries
 *            to recover a structured `medicines[]` array out of the
 *            "Prescribed Medicines:\n• Name (dosage)" text block that
 *            RecordModal.tsx used to write into `medicinesOrNotes` before
 *            this refactor.
 *   Pass B — backfills `effectiveDate` on every record (of any type) that's
 *            missing it, since the new default dashboard sort depends on
 *            it being present everywhere, not just on migrated records.
 */

import { connectDB } from '../config/db';
import { MedicalRecord, IMedicineItem } from '../models/MedicalRecord';

const COMMIT = process.argv.includes('--commit');

function isTestReportLike(doc: any): boolean {
  return (Array.isArray(doc.testResults) && doc.testResults.length > 0) || !!doc.testName || !!doc.labName;
}

/**
 * Best-effort parse of the old serializeMedicinesAndNotes() output:
 *   "Prescribed Medicines:\n• Name (dosage)\n• Name2\n\nClinical Notes:\n...text..."
 * or just "Prescribed Medicines:\n• Name (dosage)" with no notes, or plain
 * free text with no medicines block at all.
 *
 * The per-field split of "dosage" back into strength/frequency/duration/
 * instructions is NOT attempted — the original string was already a joined
 * `[strength, frequency, duration, instructions].join(' | ')`, so there's no
 * reliable way to un-join it. It's stored whole in `strength` as the closest
 * approximation, and the user can re-split it manually on next edit. This is
 * an accepted one-time approximation, not a bug.
 */
function parseLegacyMedicinesText(text: string): { medicines: IMedicineItem[]; notes: string } {
  const match = text.match(/^Prescribed Medicines:\n([\s\S]*?)(?:\n\nClinical Notes:\n([\s\S]*))?$/);
  if (!match) {
    return { medicines: [], notes: text };
  }

  const medicinesBlock = match[1] || '';
  const notes = match[2] || '';

  const medicines: IMedicineItem[] = medicinesBlock
    .split('\n')
    .map((line) => line.replace(/^•\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const lineMatch = line.match(/^(.*?)(?:\s\(([^)]*)\))?$/);
      const name = (lineMatch?.[1] || line).trim();
      const dosage = lineMatch?.[2]?.trim();
      return dosage ? { name, strength: dosage } : { name };
    });

  return { medicines, notes };
}

async function run() {
  const mongoose = await connectDB();
  console.log(`[migrateVisitRecords] Connected to database: '${mongoose.connection.name}' on host: ${mongoose.connection.host}`);
  console.log(`[migrateVisitRecords] Mode: ${COMMIT ? 'COMMIT (writes will be saved)' : 'DRY RUN (no writes)'}`);

  // ---- Pass A: reclassify documentType: 'visit' ----
  const visitRecords = await MedicalRecord.find({ documentType: 'visit' });
  console.log(`[migrateVisitRecords] Pass A: found ${visitRecords.length} 'visit' record(s) to reclassify.`);

  let reclassifiedToTestReport = 0;
  let reclassifiedToPrescription = 0;
  let medicinesRecoveredTotal = 0;

  for (const doc of visitRecords) {
    const newType = isTestReportLike(doc) ? 'test_report' : 'prescription';
    let medicines: IMedicineItem[] = [];
    let newNotes = doc.medicinesOrNotes || '';

    if (newType === 'prescription' && doc.medicinesOrNotes) {
      const parsed = parseLegacyMedicinesText(doc.medicinesOrNotes);
      medicines = parsed.medicines;
      newNotes = parsed.notes;
    }

    if (newType === 'test_report') reclassifiedToTestReport++;
    else reclassifiedToPrescription++;
    medicinesRecoveredTotal += medicines.length;

    console.log(
      `  - ${doc._id}: visit -> ${newType}` +
        (newType === 'prescription' ? ` (${medicines.length} medicine(s) recovered)` : '')
    );

    if (COMMIT) {
      doc.documentType = newType;
      if (newType === 'prescription') {
        doc.medicines = medicines;
        doc.medicinesOrNotes = newNotes;
      }
      await doc.save();
    }
  }

  console.log(
    `[migrateVisitRecords] Pass A summary: ${reclassifiedToPrescription} -> prescription, ` +
      `${reclassifiedToTestReport} -> test_report, ${medicinesRecoveredTotal} total medicine(s) recovered.`
  );

  // ---- Pass B: backfill effectiveDate on every record missing it ----
  const staleRecords = await MedicalRecord.find({ effectiveDate: { $exists: false } });
  console.log(`[migrateVisitRecords] Pass B: found ${staleRecords.length} record(s) missing effectiveDate.`);

  for (const doc of staleRecords) {
    const effectiveDate = doc.visitDate || doc.prescriptionDate || doc.createdAt || new Date();
    console.log(`  - ${doc._id}: effectiveDate -> ${effectiveDate.toISOString()}`);

    if (COMMIT) {
      doc.effectiveDate = effectiveDate;
      await doc.save({ validateBeforeSave: false });
    }
  }

  console.log(
    COMMIT
      ? '[migrateVisitRecords] Done. Changes were written.'
      : '[migrateVisitRecords] Dry run complete. No changes were written — re-run with --commit to apply.'
  );

  process.exit(0);
}

run().catch((err) => {
  console.error('[migrateVisitRecords] Fatal error:', err);
  process.exit(1);
});
