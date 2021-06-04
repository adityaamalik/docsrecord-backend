const { Patient } = require("../models/patient");
const express = require("express");
const { Doctor } = require("../models/doctor");
const router = express.Router();
const mongoose = require("mongoose");
const sgMail = require("@sendgrid/mail");
const upload = require("../services/file-upload");
const aws = require("aws-sdk");
require("dotenv").config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

//new routes

aws.config.update({
  secretAccessKey: process.env.AWS_SECRET_ACCESS,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  region: "ap-south-1",
});

const singleUpload = upload.array("images", 3);

router.put("/image-upload/:id", async (req, res) => {
  const patientimg = await Patient.findById(req.params.id);
  let imagesPaths = [];
  let imagesPatient = patientimg.images;
  if (imagesPatient) {
    imagesPatient.map((file) => {
      imagesPaths.push(file);
    });
  }

  singleUpload(req, res, async (err) => {
    if (err) {
      return res.status(422).send({
        errors: [{ title: "File Upload Error", detail: err.message }],
      });
    }

    let files = req.files;

    if (files) {
      files.map((file) => {
        imagesPaths.push(file);
      });
    }
    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      { images: imagesPaths },
      {
        new: true,
      }
    );
    if (!patient) return res.status(400).send("the images cannot be updated!");

    res.send(patient);
  });
});
router.put("/pdf-upload", async (req, res) => {
  singleUpload(req, res, async (err) => {
    if (err) {
      return res.status(422).send({
        errors: [{ title: "File Upload Error", detail: err.message }],
      });
    }

    res.send(req.files);
  });
});

router.put("/:id/deleteimage/:key", async (req, res) => {
  const key = req.params.key;
  var s3 = new aws.S3();
  s3.deleteObject(
    {
      Bucket: "docsrecord",
      Key: key,
    },
    function (error, data) {
      if (error) {
        res.status(500).send(error);
      }
      // res.status(200).send("File has been deleted successfully");
    }
  );
  const patientimg = await Patient.findById(req.params.id);
  let imagesPaths = [];
  let imagesPatient = patientimg.images;
  if (imagesPatient) {
    imagesPatient.map((file) => {
      if (file.key !== req.params.key) imagesPaths.push(file);
    });
  }
  const patient = await Patient.findByIdAndUpdate(
    req.params.id,
    { images: imagesPaths },
    {
      new: true,
    }
  );
  if (!patient) return res.status(400).send("the images cannot be updated!");

  res.send(patient);
});

router.get(`/`, async (req, res) => {
  // localhost:3000/patients?doctor=2342342

  let filter = {};
  if (req.query.doctor) {
    filter = { doctor: req.query.doctor };
  }

  const patientList = await Patient.find(filter)
    .select("name phone_number address")
    .sort({ date: -1 });

  if (!patientList) {
    res.status(500).json({ success: false });
  }
  res.send(patientList);
});

router.post(`/`, async (req, res) => {
  var doctorid = mongoose.Types.ObjectId(req.body.doctor);
  const doctor = await Doctor.findById(doctorid);
  if (!doctor) return res.status(400).send("Invalid doctor");

  let today = new Date();

  let total_cost = doctor.visit_charges;
  let total_treatments = 0;
  let treatments = req.body.treatments;
  if (treatments) {
    treatments.forEach(function (obj) {
      let charges = parseInt(obj.charges, 10);
      total_cost = total_cost + charges;
      total_treatments = total_treatments + 1;
    });
  }

  let patient = new Patient({
    email: req.body.email,
    name: req.body.name,
    phone_number: req.body.phone_number,
    age: req.body.age,
    gender: req.body.gender,
    address: req.body.address,
    total_treatments: total_treatments,
    total_cost: total_cost,
    visit_date: today,
    next_appointment_date: req.body.next_appointment_date,
    next_appointment_time: req.body.next_appointment_time,
    doctor: doctorid,
    treatments: req.body.treatments,
    date: today,
    payment_method: req.body.payment_method,
    date_of_birth: req.body.date_of_birth,
    comments: req.body.comments,
  });

  patient = await patient.save();

  if (!patient) return res.status(500).send("The patient cannot be created");

  if (patient && doctor) {
    const msg = {
      to: patient.email, // Change to your recipient
      from: "docsrecordmail@gmail.com", // Change to your verified sender
      subject: "Thanks for visiting " + doctor.clinic_name,
      html: `
      <div>
        Hello ${patient.name}, 
        <br /> 
        <br />
        Thanks for visiting <strong> ${doctor.clinic_name}.</strong> We are happy to help you.
        <br />
        Have a speedy recovery. Regards.
      </div>`,
    };
    sgMail
      .send(msg)
      .then(() => {
        console.log("Email sent");
      })
      .catch((error) => {
        console.error(error);
      });
  }

  res.send(patient);
});

router.put("/:id", async (req, res) => {
  const doc = await Doctor.findById(req.body.doctor);

  total_cost = 0;
  let total_treatments = 0;

  let treatments = req.body.treatments;
  if (treatments) {
    if (treatments.length !== 0) {
      treatments.forEach(function (obj) {
        let charges = parseInt(obj.charges, 10);
        total_cost = total_cost + charges;
        total_treatments = total_treatments + 1;
      });
    }
  }
  total_cost = total_cost + doc.visit_charges;

  let params = {
    email: req.body.email,
    name: req.body.name,
    phone_number: req.body.phone_number,
    age: req.body.age,
    gender: req.body.gender,
    address: req.body.address,
    total_treatments: total_treatments,
    total_cost: total_cost,
    next_appointment_date: req.body.next_appointment_date,
    next_appointment_time: req.body.next_appointment_time,
    treatments: req.body.treatments,
    payment_method: req.body.payment_method,
    date_of_birth: req.body.date_of_birth,
    comments: req.body.comments,
  };
  for (let prop in params) if (params[prop] === undefined) delete params[prop];

  let patient = await Patient.findByIdAndUpdate(req.params.id, params, {
    new: true,
  });

  if (!patient) return res.status(500).send("the patient cannot be updated!");

  const appointment = new Date(req.body.next_appointment_date);

  if (
    patient &&
    doc &&
    req.body.next_appointment_date &&
    req.body.next_appointment_time !== undefined
  ) {
    if (!!doc.clinic_name) {
      const msg = {
        to: patient.email, // Change to your recipient
        from: "docsrecordmail@gmail.com", // Change to your verified sender
        subject:
          "Next Appointment at " +
          doc.clinic_name +
          " on " +
          +appointment.getDate() +
          "/" +
          appointment.getMonth() +
          "/" +
          appointment.getFullYear(),
        html: `<div>Hello ${
          patient.name
        }, <br /> Your Next appointment at <strong> ${
          doc.clinic_name
        } </strong> is scheduled on <strong> ${appointment.getDate()} / ${appointment.getMonth()} / ${appointment.getFullYear()}</strong> at ${
          req.body.next_appointment_time
        }. <br />We hope to see you soon. Regards. </div>`,
      };
      sgMail
        .send(msg)
        .then(() => {
          console.log("Email sent");
        })
        .catch((error) => {
          console.error(error);
        });
    }
  }

  res.send(patient);
});

router.delete("/:id", async (req, res) => {
  try {
    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) {
      return res.status(404).send();
    }
    res.send("patient succesfully deleted");
  } catch (error) {
    res.status(500).send(error);
  }
});

router.get(`/get/count`, async (req, res) => {
  const patientCount = await Patient.countDocuments((count) => count);

  if (!patientCount) {
    res.status(500).json({ success: false });
  }
  res.send({
    patientCount: patientCount,
  });
});
router.get(`/get/count/:id`, async (req, res) => {
  const patientCount = await Patient.countDocuments({ doctor: req.params.id });

  if (!patientCount) {
    res.status(500).json({ success: false });
  }
  res.send({
    patientCount: patientCount,
  });
});

router.get(`/:id`, async (req, res) => {
  const patient = await Patient.findById(req.params.id);

  if (!patient) {
    res.status(500).json({ success: false });
  }
  res.send(patient);
});

router.get(`/appointments/:id`, async (req, res) => {
  const today = new Date();
  today.setUTCHours(0);
  today.setUTCMinutes(0);
  today.setSeconds(0);
  var doctorid = mongoose.Types.ObjectId(req.params.id);
  const patientList = await Patient.find({
    next_appointment_date: {
      $gte: today,
    },
    doctor: doctorid,
  }).sort({ date: -1 });

  if (!patientList) {
    res.status(500).json({ success: false });
  }
  res.send(patientList);
});

// stats

async function previousmonthf(id) {
  var d = mongoose.Types.ObjectId(id);
  monthData = new Date();
  let offset = monthData.getTimezoneOffset();

  monthData.setDate(1);
  monthData.setUTCHours(0);
  monthData.setUTCMinutes(0);
  monthData.setSeconds(0);

  pmonthData = new Date();

  pmonthData.setDate(1);
  pmonthData.setMonth(pmonthData.getMonth() - 1);
  pmonthData.setUTCHours(0);
  pmonthData.setUTCMinutes(0);
  pmonthData.setSeconds(0);

  TODAY = new Date();
  const patientList = await Patient.find({
    date: {
      $gte: pmonthData,
      $lte: monthData,
    },
    doctor: d,
  }).sort({ date: -1 });

  var count = 0;
  for (let key in patientList) {
    const patient = patientList[key];
    const day = patient.date.getDay();
    count = count + 1;
  }
  return count;
}

async function currentmonthf(id) {
  var d = mongoose.Types.ObjectId(id);
  monthData = new Date();
  let offset = monthData.getTimezoneOffset();

  monthData.setDate(1);
  monthData.setUTCHours(0);
  monthData.setUTCMinutes(0);
  monthData.setSeconds(0);

  pmonthData = new Date();

  pmonthData.setDate(1);
  pmonthData.setMonth(pmonthData.getMonth() + 1);
  pmonthData.setUTCHours(0);
  pmonthData.setUTCMinutes(0);
  pmonthData.setSeconds(0);

  TODAY = new Date();
  const patientList = await Patient.find({
    date: {
      $gte: monthData,
      $lte: pmonthData,
    },
    doctor: d,
  }).sort({ date: -1 });

  var count = 0;
  for (let key in patientList) {
    const patient = patientList[key];
    const day = patient.date.getDay();
    count = count + 1;
  }
  return count;
}

async function monthstatsf(id) {
  const FIRST_MONTH = 1;
  const LAST_MONTH = 12;
  const MONTHS_ARRAY = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sept",
    "Oct",
    "Nov",
    "Dec",
  ];

  let TODAY = new Date("2021-12-31T23:59:59");
  let YEAR_BEFORE = new Date("2021-01-01T05:31:00");
  var d = mongoose.Types.ObjectId(id);

  const monthsstats = await Patient.aggregate([
    {
      $match: {
        doctor: d,
        date: { $gte: YEAR_BEFORE, $lte: TODAY },
      },
    },
    {
      $group: {
        _id: { year_month: { $substrCP: ["$date", 0, 7] } },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { "_id.year_month": 1 },
    },
    {
      $project: {
        _id: 0,
        count: 1,
        month_year: {
          $concat: [
            {
              $arrayElemAt: [
                MONTHS_ARRAY,
                {
                  $subtract: [
                    { $toInt: { $substrCP: ["$_id.year_month", 5, 2] } },
                    1,
                  ],
                },
              ],
            },
            "-",
            { $substrCP: ["$_id.year_month", 0, 4] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        data: { $push: { k: "$month_year", v: "$count" } },
      },
    },
    {
      $addFields: {
        start_year: { $substrCP: [YEAR_BEFORE, 0, 4] },
        end_year: { $substrCP: [TODAY, 0, 4] },
        months1: {
          $range: [
            { $toInt: { $substrCP: [YEAR_BEFORE, 5, 2] } },
            { $add: [LAST_MONTH, 1] },
          ],
        },
        months2: {
          $range: [
            FIRST_MONTH,
            { $add: [{ $toInt: { $substrCP: [TODAY, 5, 2] } }, 1] },
          ],
        },
      },
    },
    {
      $addFields: {
        template_data: {
          $concatArrays: [
            {
              $map: {
                input: "$months1",
                as: "m1",
                in: {
                  count: 0,
                  month_year: {
                    $concat: [
                      {
                        $arrayElemAt: [
                          MONTHS_ARRAY,
                          { $subtract: ["$$m1", 1] },
                        ],
                      },
                      "-",
                      "$start_year",
                    ],
                  },
                },
              },
            },
            {
              $map: {
                input: "$months2",
                as: "m2",
                in: {
                  count: 0,
                  month_year: {
                    $concat: [
                      {
                        $arrayElemAt: [
                          MONTHS_ARRAY,
                          { $subtract: ["$$m2", 1] },
                        ],
                      },
                      "-",
                      "$end_year",
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    },
    {
      $addFields: {
        data: {
          $map: {
            input: "$template_data",
            as: "t",
            in: {
              k: "$$t.month_year",
              v: {
                $reduce: {
                  input: "$data",
                  initialValue: 0,
                  in: {
                    $cond: [
                      { $eq: ["$$t.month_year", "$$this.k"] },
                      { $add: ["$$this.v", "$$value"] },
                      { $add: [0, "$$value"] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        data: { $arrayToObject: "$data" },
        _id: 0,
      },
    },
  ]);
  var monthsarray = [];
  var d = new Date();
  var n = d.getMonth();

  if (monthsstats[0]) {
    var data = monthsstats[0].data;
    let i = 0;
    for (let key in data) {
      const k = data[key];
      if (i > n) break;
      monthsarray.push(k);
      i = i + 1;
    }
  }

  return monthsarray;
}

async function weekstatsf(id) {
  var doctorid = mongoose.Types.ObjectId(id);
  var daytoday = new Date();
  daytoday = daytoday.getDay();
  var x = 1;
  var y = 7;

  if (daytoday == 0) {
    x = 6;
    y = 0;
  } else {
    x = x + daytoday - 2;
    y = y - daytoday;
  }

  let lastweek = new Date();
  let offset = lastweek.getTimezoneOffset();
  lastweek = new Date(lastweek.getTime() - offset * 60000);
  lastweek.setDate(lastweek.getDate() - x);
  lastweek.setUTCHours(0);
  lastweek.setUTCMinutes(0);
  lastweek.setSeconds(0);
  let today = new Date();
  today = new Date(today.getTime() - offset * 60000);
  today.setDate(today.getDate() + y);
  today.setUTCHours(23);
  today.setUTCMinutes(59);
  today.setSeconds(59);

  const patientListweek = await Patient.find({
    date: {
      $gte: lastweek,
      $lte: today,
    },
    doctor: doctorid,
  }).sort({ date: -1 });

  var week = [0, 0, 0, 0, 0, 0, 0];

  for (let key in patientListweek) {
    const patient = patientListweek[key];
    const day = patient.date.getDay();

    week[day] = week[day] + 1;
  }
  var d = new Date();
  var n = d.getDay();
  if (n != 0) week = week.slice(0, n + 1);

  return week;
}
async function bothweekstatsf(id) {
  var doctorid = mongoose.Types.ObjectId(id);
  var daytoday = new Date();
  daytoday = daytoday.getDay();
  var x = 1;
  var y = 7;

  if (daytoday == 0) {
    x = 6;
    y = 0;
  } else {
    x = x + daytoday - 2;
    y = y - daytoday;
  }

  let lastweek = new Date();
  let offset = lastweek.getTimezoneOffset();
  lastweek = new Date(lastweek.getTime() - offset * 60000);
  lastweek.setDate(lastweek.getDate() - x);
  lastweek.setUTCHours(0);
  lastweek.setUTCMinutes(0);
  lastweek.setSeconds(0);

  let today = new Date();
  today = new Date(today.getTime() - offset * 60000);
  today.setDate(today.getDate() + y);
  today.setUTCHours(23);
  today.setUTCMinutes(59);
  today.setSeconds(59);

  const patientListweek = await Patient.find({
    date: {
      $gte: lastweek,
      $lte: today,
    },
    doctor: doctorid,
  }).sort({ date: -1 });

  var week = [0, 0];

  for (let key in patientListweek) {
    const patient = patientListweek[key];

    week[0] = week[0] + 1;
  }

  x = x + 7;
  y = y - 7;

  let prevweekstart = new Date();

  prevweekstart = new Date(prevweekstart.getTime() - offset * 60000);
  prevweekstart.setDate(prevweekstart.getDate() - x);
  prevweekstart.setUTCHours(0);
  prevweekstart.setUTCMinutes(0);
  prevweekstart.setSeconds(0);

  let prevweekend = new Date();
  prevweekend = new Date(prevweekend.getTime() - offset * 60000);
  prevweekend.setDate(prevweekend.getDate() + y);
  prevweekend.setUTCHours(23);
  prevweekend.setUTCMinutes(59);
  prevweekend.setSeconds(59);

  const patientListlastweek = await Patient.find({
    date: {
      $gte: prevweekstart,
      $lte: prevweekend,
    },
    doctor: doctorid,
  }).sort({ date: -1 });

  for (let key in patientListlastweek) {
    const patient = patientListlastweek[key];
    const day = patient.date.getDay();

    week[1] = week[1] + 1;
  }

  return week;
}

router.get(`/stats/:id`, async (req, res) => {
  const monthstats = await monthstatsf(req.params.id);
  // if (!monthstats) return res.status(500).send("error at backend! monthstats");
  const weekstats = await weekstatsf(req.params.id);
  // if (!weekstats) return res.status(500).send("error at backend! weekstats");
  const currentmonth = await currentmonthf(req.params.id);
  // if (!currentmonth) return res.status(500).send("error at backend! currmonth");
  const previousmonth = await previousmonthf(req.params.id);
  // if (!previousmonth)
  //   return res.status(500).send("error at backend! prev month");
  const bothweekstats = await bothweekstatsf(req.params.id);
  // if (!bothweekstats) return res.status(500).send("error at backend! bothweek");

  const monthpercentage =
    ((currentmonth - previousmonth) / previousmonth) * 100;
  const weekpercentage =
    ((bothweekstats[0] - bothweekstats[1]) / bothweekstats[1]) * 100;

  res.json({
    monthstats: monthstats,
    weekstats: weekstats,
    currentmonth: currentmonth,
    currentweek: bothweekstats[0],
    monthpercentage: monthpercentage,
    weekpercentage: weekpercentage,
  });
});

module.exports = router;
