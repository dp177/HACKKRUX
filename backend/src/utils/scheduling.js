function parseMinutes(time) {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid time format: ${time}. Expected HH:MM`);
  }
  return (hour * 60) + minute;
}

function minutesToTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeDate(date) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }
  return d;
}

function assertWithinNextWeek(date) {
  const target = normalizeDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const max = new Date(today);
  max.setDate(max.getDate() + 7);

  if (target < today || target > max) {
    throw new Error('Scheduling allowed only from today through next 7 days');
  }
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function slotOverlapsBreaks(start, end, breaks) {
  return breaks.some((b) => {
    const bs = parseMinutes(b.breakStart);
    const be = parseMinutes(b.breakEnd);
    return overlaps(start, end, bs, be);
  });
}

function generateSlots(schedule, breaks = []) {
  const shiftStart = parseMinutes(schedule.shiftStart);
  const shiftEnd = parseMinutes(schedule.shiftEnd);
  const appointmentStart = parseMinutes(schedule.appointmentStart);
  const appointmentEnd = parseMinutes(schedule.appointmentEnd);
  const slotDuration = Number(schedule.slotDuration);

  if (shiftStart >= shiftEnd) {
    throw new Error('Shift end must be after shift start');
  }

  if (appointmentStart >= appointmentEnd) {
    throw new Error('Appointment end must be after appointment start');
  }

  if (appointmentStart < shiftStart || appointmentEnd > shiftEnd) {
    throw new Error('Appointment window must be within shift');
  }

  if (!Number.isInteger(slotDuration) || slotDuration < 5 || slotDuration > 180) {
    throw new Error('Slot duration must be between 5 and 180 minutes');
  }

  const slots = [];
  let current = appointmentStart;

  while (current + slotDuration <= appointmentEnd) {
    const end = current + slotDuration;
    const blocked = slotOverlapsBreaks(current, end, breaks);

    slots.push({
      startTime: minutesToTime(current),
      endTime: minutesToTime(end),
      status: blocked ? 'BLOCKED' : 'AVAILABLE'
    });

    current = end;
  }

  return slots;
}

module.exports = {
  parseMinutes,
  minutesToTime,
  assertWithinNextWeek,
  overlaps,
  generateSlots
};
