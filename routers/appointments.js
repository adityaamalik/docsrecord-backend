const express = require("express");
const asyncHandler = require("../helpers/async-handler");
const { Appointment } = require("../models/appointment");
const { Patient } = require("../models/patient");
const { Doctor } = require("../models/doctor");
const { sendAppointmentEmail } = require("../services/notifications");
const { legacyAppointmentStart } = require("../services/legacy-appointments");

const router = express.Router();

const MINUTE = 60 * 1000;
const STATUSES = ["scheduled", "completed", "cancelled", "no_show"];
const PATIENT_FIELDS = "name phone_number email reminders_opt_in";

const parseSlot = (body) => {
  const start = new Date(body.start);
  const minutes = parseInt(body.duration_minutes, 10) || 30;
  if (Number.isNaN(start.getTime())) return { error: "Invalid start time" };
  if (minutes < 5 || minutes > 240) {
    return { error: "Duration must be between 5 and 240 minutes" };
  }
  return { start, end: new Date(start.getTime() + minutes * MINUTE) };
};

const findConflict = (doctorId, start, end, excludeId) =>
  Appointment.findOne({
    doctor: doctorId,
    status: "scheduled",
    start: { $lt: end },
    end: { $gt: start },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).populate("patient", "name");

const conflictResponse = (res, conflict) =>
  res.status(409).send({
    conflict: {
      patient: conflict.patient ? conflict.patient.name : "another patient",
      start: conflict.start,
      end: conflict.end,
    },
  });

// One-time copy of each patient's old single "next appointment" field. The flag
// is claimed first so concurrent calendar loads cannot import a patient twice.
const importLegacyAppointments = async (doctorId) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const legacy = await Patient.find({
    doctor: doctorId,
    next_appointment_date: { $gte: today },
    next_appointment_imported: { $ne: true },
  });

  for (const patient of legacy) {
    const claimed = await Patient.findOneAndUpdate(
      { _id: patient._id, next_appointment_imported: { $ne: true } },
      { next_appointment_imported: true }
    );
    if (!claimed) continue;

    const start = legacyAppointmentStart(
      patient.next_appointment_date,
      patient.next_appointment_time
    );
    await Appointment.create({
      doctor: doctorId,
      patient: patient._id,
      start,
      end: new Date(start.getTime() + 30 * MINUTE),
    });
  }
};

router.get(
  "/",
  asyncHandler(async (req, res) => {
    await importLegacyAppointments(req.user.doctorId);

    const filter = {
      doctor: req.user.doctorId,
      status: { $ne: "cancelled" },
    };
    if (req.query.patient) filter.patient = req.query.patient;
    if (req.query.from || req.query.to) {
      filter.start = {};
      if (req.query.from) filter.start.$gte = new Date(req.query.from);
      if (req.query.to) filter.start.$lt = new Date(req.query.to);
    }

    res.send(
      await Appointment.find(filter)
        .sort({ start: 1 })
        .limit(1000)
        .populate("patient", PATIENT_FIELDS)
    );
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const doctorId = req.user.doctorId;
    const patient = await Patient.findOne({
      _id: req.body.patient,
      doctor: doctorId,
    });
    if (!patient) return res.status(404).send("Patient not found");

    const slot = parseSlot(req.body);
    if (slot.error) return res.status(400).send(slot.error);
    if (slot.start < new Date(Date.now() - 5 * MINUTE)) {
      return res.status(400).send("Appointment time is in the past");
    }

    if (!req.body.force) {
      const conflict = await findConflict(doctorId, slot.start, slot.end);
      if (conflict) return conflictResponse(res, conflict);
    }

    if (typeof req.body.reminders_opt_in === "boolean") {
      patient.reminders_opt_in = req.body.reminders_opt_in;
      await patient.save();
    }

    const appointment = await Appointment.create({
      doctor: doctorId,
      patient: patient._id,
      start: slot.start,
      end: slot.end,
      reason: String(req.body.reason || ""),
    });

    const doctor = await Doctor.findById(doctorId);
    sendAppointmentEmail({
      email: patient.email,
      name: patient.name,
      clinic: doctor && doctor.clinic_name,
      start: slot.start,
    });

    res
      .status(201)
      .send(await appointment.populate("patient", PATIENT_FIELDS).execPopulate());
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const doctorId = req.user.doctorId;
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctor: doctorId,
    });
    if (!appointment) return res.status(404).send("Appointment not found");

    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) {
        return res.status(400).send("Invalid status");
      }
      appointment.status = req.body.status;
    }
    if (req.body.reason !== undefined) {
      appointment.reason = String(req.body.reason);
    }

    if (req.body.start !== undefined) {
      const slot = parseSlot(req.body);
      if (slot.error) return res.status(400).send(slot.error);

      if (!req.body.force) {
        const conflict = await findConflict(
          doctorId,
          slot.start,
          slot.end,
          appointment._id
        );
        if (conflict) return conflictResponse(res, conflict);
      }

      const moved = slot.start.getTime() !== appointment.start.getTime();
      appointment.start = slot.start;
      appointment.end = slot.end;
      // A reminder for the old time says nothing useful about the new one.
      if (moved) {
        appointment.reminder_status = "pending";
        appointment.reminder_channel = "";
        appointment.reminder_error = "";
        appointment.reminder_sent_at = undefined;
      }
    }

    if (typeof req.body.reminders_opt_in === "boolean") {
      await Patient.updateOne(
        { _id: appointment.patient, doctor: doctorId },
        { reminders_opt_in: req.body.reminders_opt_in }
      );
    }

    await appointment.save();
    res.send(
      await appointment.populate("patient", PATIENT_FIELDS).execPopulate()
    );
  })
);

module.exports = router;
