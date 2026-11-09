const cron = require("node-cron");
const { Appointment } = require("../models/appointment");
const { Patient } = require("../models/patient");
const { Doctor } = require("../models/doctor");
const {
  isReminderChannelConfigured,
  normalizePhone,
  sendAppointmentReminder,
} = require("./notifications");

const HOUR = 60 * 60 * 1000;
const REMINDER_LEAD = 24 * HOUR;
const LAST_USEFUL_MOMENT = HOUR;

const finish = (id, fields) => Appointment.updateOne({ _id: id }, fields);

const sendDueReminders = async (now = new Date()) => {
  // Left pending, so reminders begin as soon as keys are added.
  if (!isReminderChannelConfigured()) return;

  const due = await Appointment.find({
    status: "scheduled",
    reminder_status: "pending",
    start: {
      $gte: new Date(now.getTime() + LAST_USEFUL_MOMENT),
      $lte: new Date(now.getTime() + REMINDER_LEAD),
    },
  });

  for (const appointment of due) {
    const [patient, doctor] = await Promise.all([
      Patient.findById(appointment.patient),
      Doctor.findById(appointment.doctor),
    ]);

    // Stays pending: the patient may still agree before the appointment.
    if (!patient || !patient.reminders_opt_in) continue;
    if (!doctor || !doctor.payment_valid_till) continue;
    if (doctor.payment_valid_till < now) continue;

    // The claim keeps two server instances from messaging the same patient.
    const claimed = await Appointment.findOneAndUpdate(
      { _id: appointment._id, reminder_status: "pending" },
      { reminder_status: "sending" }
    );
    if (!claimed) continue;

    const phone = normalizePhone(patient.phone_number);
    if (!phone) {
      await finish(appointment._id, {
        reminder_status: "skipped",
        reminder_error: "Phone number is not a valid Indian mobile number",
      });
      continue;
    }

    try {
      const channel = await sendAppointmentReminder({
        phone,
        name: patient.name,
        clinic: doctor.clinic_name || `Dr. ${doctor.name}`,
        start: appointment.start,
      });
      await finish(appointment._id, {
        reminder_status: "sent",
        reminder_channel: channel,
        reminder_error: "",
        reminder_sent_at: new Date(),
      });
    } catch (error) {
      console.error("Reminder failed", appointment._id, error.message);
      await finish(appointment._id, {
        reminder_status: "failed",
        reminder_error: String(error.message).slice(0, 500),
      });
    }
  }
};

const startReminderJob = () => {
  cron.schedule("*/10 * * * *", () => {
    sendDueReminders().catch((error) =>
      console.error("Reminder job failed", error)
    );
  });
};

module.exports = { sendDueReminders, startReminderJob };
