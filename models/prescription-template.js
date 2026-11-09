const mongoose = require("mongoose");
const { medicineSchema } = require("./visit");

const prescriptionTemplateSchema = mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  name: { type: String, required: true, trim: true },
  medicines: [medicineSchema],
  advice: { type: String, default: "" },
});

prescriptionTemplateSchema.index({ doctor: 1, name: 1 }, { unique: true });

exports.PrescriptionTemplate = mongoose.model(
  "PrescriptionTemplate",
  prescriptionTemplateSchema
);
