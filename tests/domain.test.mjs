import assert from "node:assert/strict";
import test from "node:test";
import {
  PRAYERS,
  availableVoucherCount,
  apiDateKey,
  checkInStatus,
  createAttendance,
  createSadaqahPayment,
  createVoucher,
  isInsideMosqueLocation,
  monthlySadaqahTotal,
  nextVoucherProgress,
  parseAladhanTimings,
  prayerApiUrl,
  redeemVoucher,
  verifySadaqahPayment
} from "../src/domain.js";

test("allows check-in inside the mosque during the prayer window", () => {
  const now = new Date("2026-05-12T04:45:00+07:00");
  const result = checkInStatus(PRAYERS[0], now, true);

  assert.equal(result.allowed, true);
});

test("blocks check-in outside the mosque", () => {
  const now = new Date("2026-05-12T04:45:00+07:00");
  const result = checkInStatus(PRAYERS[0], now, false);

  assert.equal(result.allowed, false);
  assert.match(result.reason, /inside the mosque/);
});

test("blocks check-in outside the prayer window", () => {
  const now = new Date("2026-05-12T09:30:00+07:00");
  const result = createAttendance({
    userId: "usr_1",
    prayer: PRAYERS[0],
    now,
    insideMosque: true
  });

  assert.equal(result.ok, false);
});

test("validates whether a browser location is inside mosque radius", () => {
  const mosque = {
    latitude: -6.9175,
    longitude: 107.6191,
    checkInRadiusMeters: 150
  };

  assert.equal(
    isInsideMosqueLocation({ latitude: -6.91751, longitude: 107.61911 }, mosque).inside,
    true
  );
  assert.equal(
    isInsideMosqueLocation({ latitude: -6.91, longitude: 107.61 }, mosque).inside,
    false
  );
});

test("formats Aladhan API date and URL for Bandung", () => {
  const date = new Date("2026-05-12T10:00:00+07:00");

  assert.equal(apiDateKey(date), "12-05-2026");
  assert.equal(
    prayerApiUrl(date),
    "https://api.aladhan.com/v1/timingsByCity/12-05-2026?city=Bandung&country=Indonesia"
  );
});

test("parses Aladhan timings into local prayer names", () => {
  const prayers = parseAladhanTimings({
    data: {
      timings: {
        Fajr: "04:34 (WIB)",
        Dhuhr: "11:48 (WIB)",
        Asr: "15:10 (WIB)",
        Maghrib: "17:43 (WIB)",
        Isha: "18:55 (WIB)"
      }
    }
  });

  assert.deepEqual(prayers, [
    { id: "subuh", name: "Subuh", time: "04:34" },
    { id: "dzuhur", name: "Dzuhur", time: "11:48" },
    { id: "ashar", name: "Ashar", time: "15:10" },
    { id: "maghrib", name: "Maghrib", time: "17:43" },
    { id: "isya", name: "Isya", time: "18:55" }
  ]);
});

test("creates attendance with a stable daily duplicate key", () => {
  const now = new Date("2026-05-12T04:45:00+07:00");
  const result = createAttendance({
    userId: "usr_1",
    prayer: PRAYERS[0],
    now,
    insideMosque: true
  });

  assert.equal(result.ok, true);
  assert.equal(result.attendance.key, "usr_1:2026-05-12:subuh");
});

test("calculates voucher availability after every five prayers", () => {
  const attendances = Array.from({ length: 10 }, (_, index) => ({
    userId: "usr_1",
    key: `usr_1:2026-05-${String(index + 1).padStart(2, "0")}:subuh`
  }));

  assert.equal(availableVoucherCount(attendances, [], "usr_1"), 2);
  assert.equal(availableVoucherCount(attendances, [createVoucher("usr_1")], "usr_1"), 1);
});

test("reports next voucher progress after claimed vouchers", () => {
  const attendances = Array.from({ length: 7 }, (_, index) => ({
    userId: "usr_1",
    key: `att_${index}`
  }));
  const vouchers = [createVoucher("usr_1")];

  assert.deepEqual(nextVoucherProgress(attendances, vouchers, "usr_1"), {
    total: 7,
    currentCycle: 2,
    remaining: 3,
    percent: 40
  });
});

test("redeems available vouchers once", () => {
  const voucher = createVoucher("usr_1", new Date("2026-05-12T00:00:00+07:00"));
  const result = redeemVoucher(voucher, new Date("2026-05-12T09:00:00+07:00"));

  assert.equal(result.ok, true);
  assert.equal(result.voucher.status, "redeemed");
  assert.equal(redeemVoucher(result.voucher).ok, false);
});

test("creates pending sadaqah payments with minimum amount validation", () => {
  const rejected = createSadaqahPayment({ userId: "usr_1", amount: 500 });
  const accepted = createSadaqahPayment({ userId: "usr_1", amount: 25000 });

  assert.equal(rejected.ok, false);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.payment.status, "pending");
});

test("verifies pending sadaqah payments once", () => {
  const accepted = createSadaqahPayment({ userId: "usr_1", amount: 25000 });
  const verified = verifySadaqahPayment(accepted.payment);

  assert.equal(verified.ok, true);
  assert.equal(verified.payment.status, "verified");
  assert.equal(verifySadaqahPayment(verified.payment).ok, false);
});

test("sums only verified sadaqah payments in the selected month", () => {
  const payments = [
    {
      userId: "usr_1",
      amount: 25000,
      status: "verified",
      paidAt: "2026-05-01T10:00:00.000Z"
    },
    {
      userId: "usr_1",
      amount: 50000,
      status: "pending",
      paidAt: "2026-05-02T10:00:00.000Z"
    },
    {
      userId: "usr_1",
      amount: 10000,
      status: "verified",
      paidAt: "2026-04-30T10:00:00.000Z"
    }
  ];

  assert.equal(monthlySadaqahTotal(payments, "usr_1", new Date("2026-05-12T00:00:00Z")), 25000);
});
