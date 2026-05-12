import { PRAYERS } from "./domain.js";

const today = new Date();
const isoToday = localDateKey(today);
const currentMonth = localMonthKey(today);

export const seedState = {
  schemaVersion: 4,
  session: {
    isAuthenticated: false
  },
  activeUserId: "usr_aisyah",
  users: [
    {
      id: "usr_aisyah",
      name: "Aisyah Putri",
      phone: "+62 812 3456 7890",
      role: "jamaah"
    },
    {
      id: "usr_admin",
      name: "Admin DKM",
      phone: "+62 811 2222 3333",
      role: "admin"
    }
  ],
  mosque: {
    name: "Masjid Jaza",
    location: "Bandung, Indonesia",
    qrisImage: "./public/qris-placeholder.svg",
    latitude: -6.9175,
    longitude: 107.6191,
    checkInRadiusMeters: 150
  },
  prayers: PRAYERS,
  prayerSource: {
    provider: "Fallback",
    status: "idle",
    message: "Using built-in fallback times until the public API is synced.",
    syncedFor: null,
    syncedAt: null,
    lastAttemptFor: null
  },
  attendances: [
    {
      id: "att_seed_1",
      key: `usr_aisyah:${isoToday}:subuh`,
      userId: "usr_aisyah",
      prayerId: "subuh",
      prayerName: "Subuh",
      checkedInAt: localDateTime(isoToday, "04:42"),
      date: isoToday
    },
    {
      id: "att_seed_2",
      key: `usr_aisyah:${isoToday}:dzuhur`,
      userId: "usr_aisyah",
      prayerId: "dzuhur",
      prayerName: "Dzuhur",
      checkedInAt: localDateTime(isoToday, "11:58"),
      date: isoToday
    },
    {
      id: "att_seed_3",
      key: `usr_aisyah:${isoToday}:ashar`,
      userId: "usr_aisyah",
      prayerId: "ashar",
      prayerName: "Ashar",
      checkedInAt: localDateTime(isoToday, "15:18"),
      date: isoToday
    }
  ],
  vouchers: [],
  sadaqahPayments: [
    {
      id: "pay_seed_1",
      userId: "usr_aisyah",
      amount: 50000,
      note: "Jumat berkah",
      status: "verified",
      paidAt: localDateTime(`${currentMonth}-04`, "09:00"),
      verifiedAt: localDateTime(`${currentMonth}-04`, "09:10")
    },
    {
      id: "pay_seed_2",
      userId: "usr_aisyah",
      amount: 25000,
      note: "Kotak digital",
      status: "verified",
      paidAt: localDateTime(`${currentMonth}-09`, "12:00"),
      verifiedAt: localDateTime(`${currentMonth}-09`, "12:08")
    }
  ],
  usageReports: [
    {
      id: "rep_seed_1",
      week: "2026-W19",
      audience: "all",
      title: "Operasional kebersihan dan air wudhu",
      amountUsed: 850000,
      summary:
        "Dana sadaqah minggu ini digunakan untuk sabun, alat kebersihan, dan perawatan ringan area wudhu.",
      sentAt: "2026-05-10T10:00:00.000Z"
    },
    {
      id: "rep_seed_2",
      week: "2026-W18",
      audience: "all",
      title: "Paket makan kajian ba'da Maghrib",
      amountUsed: 1250000,
      summary:
        "DKM menyalurkan konsumsi sederhana untuk jamaah dan relawan kajian pekanan.",
      sentAt: "2026-05-03T10:00:00.000Z"
    }
  ]
};

function localMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function localDateKey(date) {
  return `${localMonthKey(date)}-${pad2(date.getDate())}`;
}

function localDateTime(date, time) {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
