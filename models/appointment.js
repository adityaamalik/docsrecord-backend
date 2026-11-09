const mongoose = require("mongoose");

const appointmentSchema = mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  reason: { type: String, default: "" },
  status: {
    type: String,
    enum: ["scheduled", "completed", "cancelled", "no_show"],
    default: "scheduled",
  },
  reminder_status: {
    type: String,
    enum: ["pending", "sending", "sent", "failed", "skipped"],
    default: "pending",
  },
  reminder_channel: { type: String, default: "" },
  reminder_error: { type: String, default: "" },
  reminder_sent_at: { type: Date },
});

appointmentSchema.index({ doctor: 1, start: 1 });
appointmentSchema.index({ status: 1, reminder_status: 1, start: 1 });

exports.Appointment = mongoose.model("Appointment", appointmentSchema);
