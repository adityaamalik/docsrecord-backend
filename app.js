const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv/config");
const authJwt = require("./helpers/jwt");
const errorHandler = require("./helpers/error-handler");
const cron = require("node-cron");
const { Patient } = require("./models/patient");
const { Doctor } = require("./models/doctor");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async () => {
  const today = new Date();

  const currentDate = today.getDate();
  const currentMonth = today.getMonth();

  const patients = await Patient.find();

  patients.forEach(async (patient) => {
    if (
      patient.date_of_birth.getDate() === currentDate &&
      patient.date_of_birth.getMonth() === currentMonth
    ) {
      const doc = await Doctor.findById(patient.doctor);
      if (doc) {
        if (doc.clinic_name !== undefined) {
          const msg = {
            to: patient.email, // Change to your recipient
            from: "docsrecordmail@gmail.com", // Change to your verified sender
            subject: "Happy Birthday !",
            html: `<div>Hello ${patient.name}, <br />We wish you a very happy birthday from ${doc.clinic_name}. Enjoy your day ! Regards. </div>`,
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
    }
  });
};

cron.schedule("10 0 * * *", sendEmail);

const app = express();
app.use(express.json());
app.use(cors());
app.options("*", cors());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.CONNECTION_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
  dbName: "docsrecordDB",
});

const doctorsRouter = require("./routers/doctors");
const patientsRouter = require("./routers/patients");
const paymentsRouter = require("./routers/payments");

//routes
app.use(authJwt());
app.use(errorHandler);
app.use("/doctors", doctorsRouter);
app.use("/patients", patientsRouter);
app.use("/payments", paymentsRouter);

app.get("/", (req, res) => {
  res.send("API is working fine !");
});

app.get("/test", (req, res) => {
  res.send("API is working fine with valid credentials !");
});

app.listen(process.env.PORT, () =>
  console.log("Server is running on port : " + process.env.PORT)
);
