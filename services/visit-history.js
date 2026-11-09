const { Visit } = require("../models/visit");
const { Patient } = require("../models/patient");

// Patients created before visit history have their one visit stored on the
// patient record. Turn it into a Visit before anything can overwrite it.
const ensureLegacyVisit = async (patient) => {
  if (!patient.visit_date) return;
  if ((await Visit.countDocuments({ patient: patient._id })) > 0) return;

  await Visit.create({
    patient: patient._id,
    doctor: patient.doctor,
    date: patient.visit_date,
    treatments: (patient.treatments || []).filter(
      (t) => t && String(t.treatment || "").trim()
    ),
    total_cost: patient.total_cost || 0,
  });
};

// Bills and the patient summary read these fields from the patient record.
const syncPatientFromLatestVisit = async (patientId) => {
  const latest = await Visit.findOne({ patient: patientId }).sort({ date: -1 });
  if (!latest) return;

  await Patient.updateOne(
    { _id: patientId },
    {
      visit_date: latest.date,
      treatments: latest.treatments.map((t) => ({
        treatment: t.treatment,
        charges: t.charges,
      })),
      total_treatments: latest.treatments.length,
      total_cost: latest.total_cost,
    }
  );
};

module.exports = { ensureLegacyVisit, syncPatientFromLatestVisit };
