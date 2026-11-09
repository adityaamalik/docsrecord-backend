const zoneParts = (date, timeZone) => {
  const parts = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  })
    .formatToParts(date)
    .forEach(({ type, value }) => {
      parts[type] = parseInt(value, 10);
    });
  return parts;
};

const parseTime = (text) => {
  const match = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?\s*$/.exec(text || "");
  if (!match) return { hours: 10, minutes: 0 };

  let hours = parseInt(match[1], 10) % 24;
  const meridiem = (match[3] || "").toUpperCase();
  if (meridiem === "PM" && hours < 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;
  return { hours, minutes: parseInt(match[2], 10) };
};

// Old records hold a date and a separate "hh:mm A" string in clinic local time.
const legacyAppointmentStart = (date, timeText) => {
  const timeZone = process.env.CLINIC_TIMEZONE || "Asia/Kolkata";
  const day = zoneParts(new Date(date), timeZone);
  const { hours, minutes } = parseTime(timeText);
  const wallClock = Date.UTC(day.year, day.month - 1, day.day, hours, minutes);

  const seen = zoneParts(new Date(wallClock), timeZone);
  const offset =
    Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) -
    wallClock;
  return new Date(wallClock - offset);
};

module.exports = { legacyAppointmentStart };
