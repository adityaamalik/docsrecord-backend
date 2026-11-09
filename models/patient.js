const mongoose = require("mongoose");

const patientSchema = mongoose.Schema({
  email: {
    type: String,
    default: "",
  },
  name: {
    type: String,
    required: true,
  },
  phone_number: {
    type: String,
    default: "",
  },
  age: {
    type: Number,
    default: 0,
  },
  gender: {
    type: String,
    default: "",
  },
  date_of_birth: {
    type: Date,
  },
  address: {
    type: String,
    default: "",
  },
  payment_method: {
    type: String,
    default: "",
  },
  total_treatments: {
    type: Number,
    default: "",
  },
  total_cost: {
    type: Number,
    default: 0,
  },
  visit_date: {
    type: Date,
  },
  next_appointment_date: {
    type: Date,
  },
  next_appointment_time: {
    type: String,
  },
  next_appointment_imported: {
    type: Boolean,
    default: false,
  },
  reminders_opt_in: {
    type: Boolean,
    default: false,
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
  },
  treatments: {
    type: Object,
  },
  date: {
    type: Date,
  },
  images: [],
  comments: [],
});

exports.Patient = mongoose.model("Patient", patientSchema);
