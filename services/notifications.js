const axios = require("axios");
const sgMail = require("@sendgrid/mail");

const TIME_ZONE = () => process.env.CLINIC_TIMEZONE || "Asia/Kolkata";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE(),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

const formatTime = (date) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

// Indian mobile numbers only: the app and both templates assume +91.
const normalizePhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return digits;
};

// WhatsApp rejects template values with newlines or long runs of spaces, and
// Fast2SMS uses the pipe as its separator.
const cleanValue = (value) =>
  String(value || "")
    .replace(/[\r\n\t|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 30);

const isWhatsAppConfigured = () =>
  !!(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_TEMPLATE_NAME
  );

const isSmsConfigured = () =>
  !!(
    process.env.FAST2SMS_API_KEY &&
    process.env.FAST2SMS_SENDER_ID &&
    process.env.FAST2SMS_TEMPLATE_ID
  );

const isReminderChannelConfigured = () =>
  isWhatsAppConfigured() || isSmsConfigured();

const sendWhatsApp = async (phone, values) => {
  const version = process.env.WHATSAPP_API_VERSION || "v23.0";
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: `91${phone}`,
      type: "template",
      template: {
        name: process.env.WHATSAPP_TEMPLATE_NAME,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
        components: [
          {
            type: "body",
            parameters: values.map((text) => ({ type: "text", text })),
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
      timeout: 15000,
    }
  );
};

const sendSms = async (phone, values) => {
  const body = new URLSearchParams({
    route: "dlt",
    sender_id: process.env.FAST2SMS_SENDER_ID,
    message: process.env.FAST2SMS_TEMPLATE_ID,
    variables_values: values.join("|"),
    numbers: phone,
    flash: "0",
  });

  const response = await axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    body.toString(),
    {
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 15000,
    }
  );

  if (!response.data || response.data.return !== true) {
    throw new Error(
      (response.data && JSON.stringify(response.data.message)) ||
        "Fast2SMS rejected the message"
    );
  }
};

const describeError = (error) => {
  const body = error.response && error.response.data;
  const detail = body && ((body.error && body.error.message) || body.message);
  return String(detail || error.message).slice(0, 300);
};

// Tries WhatsApp, then SMS. Throws only if every configured channel failed.
const sendAppointmentReminder = async ({ phone, name, clinic, start }) => {
  const values = [
    cleanValue(name),
    cleanValue(clinic),
    formatDate(start),
    formatTime(start),
  ];
  const failures = [];

  if (isWhatsAppConfigured()) {
    try {
      await sendWhatsApp(phone, values);
      return "whatsapp";
    } catch (error) {
      failures.push(`whatsapp: ${describeError(error)}`);
    }
  }

  if (isSmsConfigured()) {
    try {
      await sendSms(phone, values);
      return "sms";
    } catch (error) {
      failures.push(`sms: ${describeError(error)}`);
    }
  }

  throw new Error(failures.join("; "));
};

const sendAppointmentEmail = ({ email, name, clinic, start }) => {
  if (!email || !clinic || !process.env.SENDGRID_API_KEY) return;

  sgMail
    .send({
      to: email,
      from: "docsrecordmail@gmail.com",
      subject: `Next Appointment at ${clinic} on ${formatDate(start)}`,
      html: `<div>Hello ${name}, <br /> Your next appointment at <strong>${clinic}</strong> is scheduled on <strong>${formatDate(
        start
      )}</strong> at ${formatTime(
        start
      )}. <br />We hope to see you soon. Regards.</div>`,
    })
    .catch((error) => console.error(error));
};

module.exports = {
  isReminderChannelConfigured,
  normalizePhone,
  sendAppointmentReminder,
  sendAppointmentEmail,
};
