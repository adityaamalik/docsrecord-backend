const mongoose = require("mongoose");

const doctorSchema = mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
  },
  name: {
    type: String,
    required: true,
  },
  phone_number: {
    type: Number,
    default: 0,
  },
  qualifications: {
    type: String,
    default: "",
  },
  clinic_name: {
    type: String,

    default: "",
  },
  clinic_address: {
    type: String,
    default: "",
  },
  image: {
    type: Object,
  },
  register_date: {
    type: Date,
  },
  payment_valid_till: {
    type: Date,
  },

  visit_charges: {
    type: Number,
    default: 0,
  },
  timings: {
    type: Object,
  },
});

exports.Doctor = mongoose.model("Doctor", doctorSchema);
