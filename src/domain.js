export const PRAYERS = [
  { id: "subuh", name: "Subuh", time: "04:38" },
  { id: "dzuhur", name: "Dzuhur", time: "11:52" },
  { id: "ashar", name: "Ashar", time: "15:13" },
  { id: "maghrib", name: "Maghrib", time: "17:47" },
  { id: "isya", name: "Isya", time: "18:59" }
];

export const PRAYER_API = {
  provider: "Aladhan",
  baseUrl: "https://api.aladhan.com/v1/timingsByCity",
  city: "Bandung",
  country: "Indonesia"
};

export const CHECK_IN_WINDOW_MINUTES = 45;
export const VOUCHER_THRESHOLD = 5;

export function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function apiDateKey(date = new Date()) {
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function prayerApiUrl(date = new Date(), config = PRAYER_API) {
  const url = new URL(`${config.baseUrl}/${apiDateKey(date)}`);
  url.searchParams.set("city", config.city);
  url.searchParams.set("country", config.country);

  return url.toString();
}

export function parseAladhanTimings(payload) {
  const timings = payload?.data?.timings;
  if (!timings) {
    throw new Error("Prayer API response does not include timings.");
  }

  return [
    { id: "subuh", name: "Subuh", time: cleanApiTime(timings.Fajr) },
    { id: "dzuhur", name: "Dzuhur", time: cleanApiTime(timings.Dhuhr) },
    { id: "ashar", name: "Ashar", time: cleanApiTime(timings.Asr) },
    { id: "maghrib", name: "Maghrib", time: cleanApiTime(timings.Maghrib) },
    { id: "isya", name: "Isya", time: cleanApiTime(timings.Isha) }
  ];
}

export function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesFromDate(date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function checkInStatus(prayer, now = new Date(), insideMosque = false) {
  const diff = Math.abs(minutesFromDate(now) - minutesFromTime(prayer.time));

  if (!insideMosque) {
    return {
      allowed: false,
      reason: "Confirm that you are inside the mosque before checking in."
    };
  }

  if (diff > CHECK_IN_WINDOW_MINUTES) {
    return {
      allowed: false,
      reason: `Check-in opens ${CHECK_IN_WINDOW_MINUTES} minutes before and after ${prayer.name}.`
    };
  }

  return { allowed: true, reason: "Ready to check in." };
}

export function distanceMeters(from, to) {
  const earthRadiusMeters = 6371000;
  const fromLat = degreesToRadians(from.latitude);
  const toLat = degreesToRadians(to.latitude);
  const deltaLat = degreesToRadians(to.latitude - from.latitude);
  const deltaLng = degreesToRadians(to.longitude - from.longitude);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(earthRadiusMeters * c);
}

export function isInsideMosqueLocation(position, mosque) {
  const distance = distanceMeters(position, {
    latitude: mosque.latitude,
    longitude: mosque.longitude
  });

  return {
    inside: distance <= mosque.checkInRadiusMeters,
    distance
  };
}

export function attendanceKey(userId, prayerId, date = new Date()) {
  return `${userId}:${dateKey(date)}:${prayerId}`;
}

export function hasAttendance(attendances, userId, prayerId, date = new Date()) {
  const key = attendanceKey(userId, prayerId, date);
  return attendances.some((attendance) => attendance.key === key);
}

export function createAttendance({ userId, prayer, now = new Date(), insideMosque }) {
  const status = checkInStatus(prayer, now, insideMosque);
  if (!status.allowed) {
    return { ok: false, error: status.reason };
  }

  return {
    ok: true,
    attendance: {
      id: cryptoId("att"),
      key: attendanceKey(userId, prayer.id, now),
      userId,
      prayerId: prayer.id,
      prayerName: prayer.name,
      checkedInAt: now.toISOString(),
      date: dateKey(now)
    }
  };
}

export function completedPrayerCount(attendances, userId) {
  return attendances.filter((attendance) => attendance.userId === userId).length;
}

export function availableVoucherCount(attendances, vouchers, userId) {
  const earned = Math.floor(completedPrayerCount(attendances, userId) / VOUCHER_THRESHOLD);
  const alreadyCreated = vouchers.filter((voucher) => voucher.userId === userId).length;
  return Math.max(earned - alreadyCreated, 0);
}

export function nextVoucherProgress(attendances, vouchers, userId) {
  const total = completedPrayerCount(attendances, userId);
  const created = vouchers.filter((voucher) => voucher.userId === userId).length;
  const usedForExistingVouchers = created * VOUCHER_THRESHOLD;
  const currentCycle = Math.max(total - usedForExistingVouchers, 0);

  return {
    total,
    currentCycle: Math.min(currentCycle, VOUCHER_THRESHOLD),
    remaining: Math.max(VOUCHER_THRESHOLD - currentCycle, 0),
    percent: Math.min((currentCycle / VOUCHER_THRESHOLD) * 100, 100)
  };
}

export function createVoucher(userId, now = new Date()) {
  return {
    id: cryptoId("vcr"),
    userId,
    title: "Voucher Berkah 5 Shalat",
    status: "available",
    createdAt: now.toISOString(),
    redeemedAt: null
  };
}

export function redeemVoucher(voucher, now = new Date()) {
  if (!voucher || voucher.status !== "available") {
    return { ok: false, error: "This voucher is not available." };
  }

  return {
    ok: true,
    voucher: {
      ...voucher,
      status: "redeemed",
      redeemedAt: now.toISOString()
    }
  };
}

export function monthlySadaqahTotal(payments, userId, date = new Date()) {
  const key = monthKey(date);
  return payments
    .filter((payment) => payment.userId === userId)
    .filter((payment) => payment.status === "verified")
    .filter((payment) => monthKey(new Date(payment.paidAt)) === key)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export function createSadaqahPayment({ userId, amount, note = "", now = new Date() }) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 1000) {
    return { ok: false, error: "Minimum sadaqah is Rp1.000." };
  }

  return {
    ok: true,
    payment: {
      id: cryptoId("pay"),
      userId,
      amount: Math.round(numericAmount),
      note,
      status: "pending",
      paidAt: now.toISOString(),
      verifiedAt: null
    }
  };
}

export function verifySadaqahPayment(payment, now = new Date()) {
  if (!payment || payment.status !== "pending") {
    return { ok: false, error: "Only pending payments can be verified." };
  }

  return {
    ok: true,
    payment: {
      ...payment,
      status: "verified",
      verifiedAt: now.toISOString()
    }
  };
}

export function weeklyUsageForUser(reports, userId) {
  return reports
    .filter((report) => report.audience === "all" || report.audience === userId)
    .sort((a, b) => b.week.localeCompare(a.week));
}

export function cryptoId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function cleanApiTime(value) {
  const match = String(value ?? "").match(/\d{1,2}:\d{2}/);
  if (!match) {
    throw new Error(`Invalid prayer time: ${value}`);
  }

  const [hours, minutes] = match[0].split(":");
  return `${pad2(Number(hours))}:${minutes}`;
}
