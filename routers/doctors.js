const { Doctor } = require("../models/doctor");
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const upload = require("../services/file-upload");
const _ = require("lodash");
const aws = require("aws-sdk");
const { OAuth2Client } = require("google-auth-library");
require("dotenv").config();

const googleClient = new OAuth2Client();

aws.config.update({
  secretAccessKey: process.env.AWS_SECRET_ACCESS,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  region: "ap-south-1",
});

const singleUpload = upload.single("image");

router.put("/image-upload/:id", async (req, res) => {
  var doctorInfo = await Doctor.findById(req.params.id).select("-password");
  var doctorImage = doctorInfo.image;
  if (doctorImage) {
    doctorImage = doctorInfo.image.key;
    var s3 = new aws.S3();
    s3.deleteObject(
      {
        Bucket: "docsrecord",
        Key: doctorImage,
      },
      function (error, data) {
        if (error) {
          console.log(error);
        }
      }
    );
  }

  singleUpload(req, res, async (err) => {
    if (err) {
      return res.status(422).send({
        errors: [{ title: "File Upload Error", detail: err.message }],
      });
    }
    const doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      { image: req.file },
      {
        new: true,
      }
    );
    if (!doctor) return res.status(400).send("the doctor cannot be updated!");

    var sanitizeddoctor = _.omit(doctor.toObject(), "password");

    res.status(200).send({ doctor: sanitizeddoctor });
  });
});

router.get(`/`, async (req, res) => {
  const doctorList = await Doctor.find().select("-password");

  if (!doctorList) {
    res.status(500).json({ success: false });
  }
  res.status(200).send(doctorList);
});

router.get("/:id", async (req, res) => {
  const doctor = await Doctor.findById(req.params.id).select("-password");

  if (!doctor) {
    res
      .status(500)
      .json({ message: "The Doctor with the given ID was not found." });
  }
  res.status(200).send(doctor);
});

router.put("/:id", async (req, res) => {
  let params = {
    email: req.body.email,
    name: req.body.name,
    payment_valid_till: req.body.payment_valid_till,
    clinic_name: req.body.clinic_name,
    clinic_address: req.body.clinic_address,

    free_trial: req.body.free_trial,
    visit_charges: req.body.visit_charges,

    qualifications: req.body.qualifications,
    phone_number: req.body.phone_number,
  };
  for (let prop in params) if (!params[prop]) delete params[prop];

  const doctor = await Doctor.findByIdAndUpdate(req.params.id, params, {
    new: true,
  });

  var sanitizeddoctor = _.omit(doctor.toObject(), "password");

  if (!doctor) return res.status(400).send("the doctor cannot be updated!");

  res.status(200).send({ doctor: sanitizeddoctor });
});

router.delete("/:id", async (req, res) => {
  try {
    const doctor = await Doctor.findByIdAndDelete(req.params.id);
    if (!doctor) {
      return res.status(404).send();
    }
    res.send("Doctor succesfully deleted");
  } catch (error) {
    res.status(500).send(error);
  }
});

router.post("/google", async (req, res) => {
  // Without an audience the library accepts tokens issued for any Google app.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("GOOGLE_CLIENT_ID is not set");
    return res.status(500).send("Google sign-in is not configured");
  }
  if (!req.body.credential) {
    return res.status(400).send("Google credential is required");
  }

  let profile;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.credential,
      audience: clientId,
    });
    profile = ticket.getPayload();
  } catch (error) {
    return res.status(401).send("Invalid Google credential");
  }

  if (!profile.email || !profile.email_verified) {
    return res.status(401).send("Google email is not verified");
  }

  try {
    let doctor = await Doctor.findOne({ email: profile.email }).collation({
      locale: "en",
      strength: 2,
    });

    if (!doctor) {
      var day = new Date();
      let offset = day.getTimezoneOffset();
      day = new Date(day.getTime() - offset * 60000);
      var pay = new Date();
      pay = new Date(pay.getTime() - offset * 60000);
      pay = pay.setDate(pay.getDate() + 30);

      doctor = await new Doctor({
        email: profile.email,
        name: profile.name || profile.email,
        register_date: day,
        payment_valid_till: pay,
      }).save();
    }

    const token = jwt.sign({ doctorId: doctor._id }, process.env.secret, {
      expiresIn: "1d",
    });

    res.status(200).send({
      doctor: _.omit(doctor.toObject(), "password"),
      token: token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Some error occured");
  }
});

module.exports = router;
