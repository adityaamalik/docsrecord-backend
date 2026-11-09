const express = require("express");
const asyncHandler = require("../helpers/async-handler");
const { Visit } = require("../models/visit");
const { Patient } = require("../models/patient");
const { Doctor } = require("../models/doctor");
const {
  ensureLegacyVisit,
  syncPatientFromLatestVisit,
} = require("../services/visit-history");

const router = express.Router();

const cleanTreatments = (treatments) =>
  (Array.isArray(treatments) ? treatments : [])
    .filter((t) => t && String(t.treatment || "").trim())
    .map((t) => ({
      treatment: String(t.treatment).trim(),
      charges: String(t.charges || "0"),
    }));

const cleanMedicines = (medicines) =>
  (Array.isArray(medicines) ? medicines : [])
    .filter((m) => m && String(m.name || "").trim())
    .map((m) => ({
      name: String(m.name).trim(),
      dosage: String(m.dosage || ""),
      frequency: String(m.frequency || ""),
      duration: String(m.duration || ""),
      instructions: String(m.instructions || ""),
    }));

const fieldsFrom = async (body, doctorId) => {
  const treatments = cleanTreatments(body.treatments);
  const doctor = await Doctor.findById(doctorId);
  const charges = treatments.reduce(
    (sum, t) => sum + (parseInt(t.charges, 10) || 0),
    0
  );

  return {
    date: body.date ? new Date(body.date) : new Date(),
    complaint: String(body.complaint || ""),
    diagnosis: String(body.diagnosis || ""),
    notes: String(body.notes || ""),
    treatments,
    total_cost: charges + ((doctor && doctor.visit_charges) || 0),
    medicines: cleanMedicines(body.medicines),
    advice: String(body.advice || ""),
  };
};

const ownedPatient = (doctorId, patientId) =>
  Patient.findOne({ _id: patientId, doctor: doctorId });

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const patient = await ownedPatient(req.user.doctorId, req.query.patient);
    if (!patient) return res.status(404).send("Patient not found");

    await ensureLegacyVisit(patient);
    res.send(
      await Visit.find({
        patient: patient._id,
        doctor: req.user.doctorId,
      }).sort({ date: -1 })
    );
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const patient = await ownedPatient(req.user.doctorId, req.body.patient);
    if (!patient) return res.status(404).send("Patient not found");

    const fields = await fieldsFrom(req.body, req.user.doctorId);
    if (Number.isNaN(fields.date.getTime())) {
      return res.status(400).send("Invalid visit date");
    }

    await ensureLegacyVisit(patient);
    const visit = await Visit.create({
      ...fields,
      patient: patient._id,
      doctor: req.user.doctorId,
    });
    await syncPatientFromLatestVisit(patient._id);
    res.status(201).send(visit);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const fields = await fieldsFrom(req.body, req.user.doctorId);
    if (Number.isNaN(fields.date.getTime())) {
      return res.status(400).send("Invalid visit date");
    }

    const visit = await Visit.findOneAndUpdate(
      { _id: req.params.id, doctor: req.user.doctorId },
      fields,
      { new: true }
    );
    if (!visit) return res.status(404).send("Visit not found");

    await syncPatientFromLatestVisit(visit.patient);
    res.send(visit);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const visit = await Visit.findOneAndDelete({
      _id: req.params.id,
      doctor: req.user.doctorId,
    });
    if (!visit) return res.status(404).send("Visit not found");

    await syncPatientFromLatestVisit(visit.patient);
    res.send({ deleted: true });
  })
);

module.exports = router;
module.exports.cleanMedicines = cleanMedicines;
