const mongoose = require("mongoose");

const treatmentSchema = mongoose.Schema(
  {
    treatment: { type: String, required: true, trim: true },
    charges: { type: String, default: "0" },
  },
  { _id: false }
);

const medicineSchema = mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dosage: { type: String, default: "" },
    frequency: { type: String, default: "" },
    duration: { type: String, default: "" },
    instructions: { type: String, default: "" },
  },
  { _id: false }
);

const visitSchema = mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true,
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  date: { type: Date, required: true },
  complaint: { type: String, default: "" },
  diagnosis: { type: String, default: "" },
  notes: { type: String, default: "" },
  treatments: [treatmentSchema],
  total_cost: { type: Number, default: 0 },
  medicines: [medicineSchema],
  advice: { type: String, default: "" },
});

visitSchema.index({ doctor: 1, patient: 1, date: -1 });

exports.Visit = mongoose.model("Visit", visitSchema);
exports.medicineSchema = medicineSchema;
