import {
  PRAYERS,
  PRAYER_API,
  availableVoucherCount,
  checkInStatus,
  completedPrayerCount,
  createAttendance,
  createSadaqahPayment,
  createVoucher,
  formatRupiah,
  hasAttendance,
  isInsideMosqueLocation,
  monthKey,
  monthlySadaqahTotal,
  parseAladhanTimings,
  prayerApiUrl,
  nextVoucherProgress,
  redeemVoucher,
  verifySadaqahPayment,
  weeklyUsageForUser
} from "./domain.js";
import { loadState, resetState, saveState } from "./storage.js";

let state = loadState();
let currentView = "dashboard";
let flash = "";
let locationState = {
  status: "idle",
  inside: false,
  distance: null,
  message: "Verify your location before checking in."
};
let prayerSyncInFlight = false;

const app = document.querySelector("#app");

function activeUser() {
  return state.users.find((user) => user.id === state.activeUserId) ?? state.users[0];
}

function setState(nextState, message = "") {
  state = nextState;
  flash = message;
  saveState(state);
  render();
}

function setView(view) {
  currentView = view;
  flash = "";
  render();
}

function startSession(userId) {
  const user = state.users.find((item) => item.id === userId);
  currentView = user?.role === "admin" ? "admin" : "dashboard";
  setState(
    {
      ...state,
      activeUserId: userId,
      session: { isAuthenticated: true }
    },
    "Welcome to Masjid Jaza."
  );
}

function endSession() {
  currentView = "dashboard";
  locationState = {
    status: "idle",
    inside: false,
    distance: null,
    message: "Verify your location before checking in."
  };
  setState(
    {
      ...state,
      session: { isAuthenticated: false }
    },
    ""
  );
}

function switchUser(userId) {
  setState({ ...state, activeUserId: userId }, "Profile switched.");
}

async function syncPrayerTimes(force = false) {
  const today = new Date();
  const syncedForToday = state.prayerSource?.syncedFor === dateKeyForSync(today);
  const attemptedToday = state.prayerSource?.lastAttemptFor === dateKeyForSync(today);

  if (prayerSyncInFlight || (!force && syncedForToday)) return;
  if (!force && attemptedToday && state.prayerSource?.status === "fallback") return;
  if (!navigator.onLine && !force) return;

  prayerSyncInFlight = true;
  state = {
    ...state,
    prayerSource: {
      ...state.prayerSource,
      status: "syncing",
      message: `Syncing prayer times from ${PRAYER_API.provider}.`,
      lastAttemptFor: dateKeyForSync(today)
    }
  };
  saveState(state);
  renderWithoutSync();

  try {
    const response = await fetch(prayerApiUrl(today), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Prayer API returned ${response.status}.`);
    }

    const payload = await response.json();
    const prayers = parseAladhanTimings(payload);
    prayerSyncInFlight = false;
    setState(
      {
        ...state,
        prayers,
        prayerSource: {
          provider: PRAYER_API.provider,
          status: "synced",
          message: `Synced from ${PRAYER_API.provider} for ${PRAYER_API.city}, ${PRAYER_API.country}.`,
          syncedFor: dateKeyForSync(today),
          syncedAt: new Date().toISOString(),
          lastAttemptFor: dateKeyForSync(today)
        }
      },
      force ? "Prayer times refreshed from the public API." : flash
    );
  } catch (error) {
    prayerSyncInFlight = false;
    setState(
      {
        ...state,
        prayerSource: {
          ...state.prayerSource,
          provider: state.prayerSource?.provider ?? "Fallback",
          status: "fallback",
          message: "Could not reach the public prayer-times API. Using fallback Bandung times.",
          syncedFor: state.prayerSource?.syncedFor ?? null,
          syncedAt: state.prayerSource?.syncedAt ?? null,
          lastAttemptFor: dateKeyForSync(today)
        }
      },
      force ? "Prayer API unavailable. Fallback times are still shown." : flash
    );
  }
}

function renderWithoutSync() {
  const originalInFlight = prayerSyncInFlight;
  prayerSyncInFlight = true;
  render();
  prayerSyncInFlight = originalInFlight;
}

function userAttendances(userId = activeUser().id) {
  return state.attendances.filter((attendance) => attendance.userId === userId);
}

function userVouchers(userId = activeUser().id) {
  return state.vouchers.filter((voucher) => voucher.userId === userId);
}

function navItems(user) {
  if (user.role === "admin") {
    return [
      ["admin", "Console"],
      ["attendance", "Attendance"],
      ["sadaqah", "Sadaqah"],
      ["reports", "Reports"]
    ];
  }

  const base = [
    ["dashboard", "Dashboard"],
    ["attendance", "Attendance"],
    ["vouchers", "Vouchers"],
    ["sadaqah", "Sadaqah"],
    ["reports", "Reports"]
  ];

  return base;
}

function render() {
  const user = activeUser();

  if (!state.session?.isAuthenticated) {
    app.innerHTML = landingView();
    syncPrayerTimes();
    return;
  }

  const items = navItems(user);
  if (!items.some(([view]) => view === currentView)) {
    currentView = items[0][0];
  }

  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#dashboard" data-nav="dashboard" aria-label="Open dashboard">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>
          <strong>${state.mosque.name}</strong>
          <small>${state.mosque.location}</small>
        </span>
      </a>
      <div class="profile-switcher">
        <label for="profile">Profile</label>
        <div class="profile-actions">
          <select id="profile" data-action="switch-user">
            ${state.users
              .map(
                (option) =>
                  `<option value="${option.id}" ${option.id === user.id ? "selected" : ""}>${option.name} (${option.role})</option>`
              )
              .join("")}
          </select>
          <button type="button" class="secondary compact-button" data-action="logout">Logout</button>
        </div>
      </div>
    </header>

    <nav class="nav" aria-label="Main navigation">
      ${items
        .map(
          ([view, label]) =>
            `<button class="${currentView === view ? "active" : ""}" data-nav="${view}" type="button">${label}</button>`
        )
        .join("")}
    </nav>

    <main>
      ${flash ? `<div class="notice" role="status">${flash}</div>` : ""}
      ${viewTemplate(currentView, user)}
    </main>
  `;

  syncPrayerTimes();
}

function landingView() {
  return `
    <main class="landing">
      <section class="landing-hero">
        <div class="landing-copy">
          <a class="brand landing-brand" href="#" aria-label="Masjid Jaza home">
            <span class="brand-mark" aria-hidden="true"></span>
            <span>
              <strong>${state.mosque.name}</strong>
              <small>${state.mosque.location}</small>
            </span>
          </a>
          <p class="eyebrow">Jamaah services</p>
          <h1>Masjid Jaza</h1>
          <p class="lead">A simple digital companion for prayer attendance, voucher rewards, QRIS sadaqah, and transparent weekly fund updates.</p>
          <div class="hero-actions">
            <button type="button" data-action="login" data-user="usr_aisyah">Enter as jamaah</button>
            <button type="button" class="secondary" data-action="login" data-user="usr_admin">Enter as admin</button>
          </div>
        </div>
        <img src="./public/masjid-jaza-hero.svg" alt="Masjid Jaza illustration" />
      </section>

      <section class="landing-strip" aria-label="Main features">
        ${metricCard("Prayer attendance", "Geo", "Check in only when location is verified")}
        ${metricCard("Voucher partners", "5x", "Redeem at mosque and future retail partners")}
        ${metricCard("Sadaqah visibility", "QRIS", "Track monthly giving and weekly usage")}
      </section>
    </main>
  `;
}

function viewTemplate(view, user) {
  if (view === "attendance") return attendanceView(user);
  if (view === "vouchers") return voucherView(user);
  if (view === "sadaqah") return sadaqahView(user);
  if (view === "reports") return reportsView(user);
  if (view === "admin") return adminView(user);
  return dashboardView(user);
}

function dashboardView(user) {
  const progress = nextVoucherProgress(state.attendances, state.vouchers, user.id);
  const monthlyTotal = monthlySadaqahTotal(state.sadaqahPayments, user.id);
  const reports = weeklyUsageForUser(state.usageReports, user.id);
  const available = state.vouchers.filter(
    (voucher) => voucher.userId === user.id && voucher.status === "available"
  ).length;
  const now = new Date();

  return `
    <section class="prayer-first-layout">
      <article class="hero-panel prayer-hero">
        <div>
          <p class="eyebrow">Today's prayers</p>
          <h1>Assalamu'alaikum, ${user.name.split(" ")[0]}</h1>
          <p class="lead">Start with prayer check-in. Voucher progress, sadaqah, and mosque updates stay close by.</p>
          <div class="hero-actions">
            <button type="button" data-action="verify-location">
              ${locationState.status === "checking" ? "Checking..." : "Verify location"}
            </button>
            <button type="button" class="secondary" data-nav="sadaqah">Pay sadaqah</button>
          </div>
        </div>

        <div class="next-prayer-panel">
          <p class="eyebrow">Location</p>
          <h2>${locationTitle()}</h2>
          <p>${locationState.message}</p>
        </div>
      </article>

      <section class="today-prayer-board panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${formatDate(now.toISOString())}</p>
            <h2>Prayer check-in</h2>
            <p class="section-note">${prayerSourceText()}</p>
          </div>
          <button type="button" class="secondary compact-button" data-action="refresh-prayers">
            ${state.prayerSource?.status === "syncing" ? "Syncing..." : "Refresh times"}
          </button>
        </div>
        <div class="prayer-grid dashboard-prayers">
          ${state.prayers.map((prayer) => prayerCard(prayer, user, now)).join("")}
        </div>
      </section>

      <section class="metric-row" aria-label="Summary">
        ${metricCard("Voucher progress", `${progress.currentCycle}/${PRAYERS.length}`, `${progress.remaining} more for next voucher`)}
        ${metricCard("Available vouchers", available, "Mosque and future partner redemption")}
        ${metricCard("This month sadaqah", formatRupiah(monthlyTotal), monthKey())}
      </section>

      <section class="two-column">
        <article class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Next reward</p>
              <h2>Voucher progress</h2>
            </div>
            <strong>${progress.currentCycle}/${PRAYERS.length}</strong>
          </div>
          <div class="progress" aria-label="Voucher progress">
            <span style="width: ${progress.percent}%"></span>
          </div>
          <div class="compact-list">
            ${userAttendances(user.id)
              .slice(-4)
              .reverse()
              .map((attendance) => `<p>${attendance.prayerName}<span>${formatDateTime(attendance.checkedInAt)}</span></p>`)
              .join("") || "<p>No attendance yet<span>Start today</span></p>"}
          </div>
        </article>

        <article class="panel accent">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Latest usage report</p>
              <h2>${reports[0]?.title ?? "No report yet"}</h2>
            </div>
          </div>
          <p>${reports[0]?.summary ?? "Weekly sadaqah usage updates will appear here."}</p>
          <button type="button" class="secondary" data-nav="reports">View reports</button>
        </article>
      </section>
    </section>
  `;
}

function attendanceView(user) {
  const now = new Date();

  return `
    <section class="page-heading">
      <p class="eyebrow">Mosque attendance</p>
      <h1>Prayer check-in</h1>
      <p>${formatDateTime(now.toISOString())}. ${prayerSourceText()}</p>
    </section>

    <section class="panel">
      <div class="location-gate ${locationState.inside ? "verified" : ""}">
        <div>
          <p class="eyebrow">Location check</p>
          <h2>${locationTitle()}</h2>
          <p>${locationState.message}</p>
        </div>
        <button type="button" class="secondary" data-action="verify-location">
          ${locationState.status === "checking" ? "Checking..." : "Verify location"}
        </button>
      </div>
      <div class="prayer-grid">
        ${state.prayers.map((prayer) => prayerCard(prayer, user, now)).join("")}
      </div>
    </section>
  `;
}

function prayerCard(prayer, user, now) {
  const attended = hasAttendance(state.attendances, user.id, prayer.id, now);
  const status = checkInStatus(prayer, now, locationState.inside);
  const disabled = attended || !status.allowed || locationState.status === "checking";

  return `
    <article class="prayer-card">
      <div>
        <h2>${prayer.name}</h2>
        <p>${prayer.time}</p>
      </div>
      <span class="pill ${status.allowed ? "good" : ""}">${attended ? "Checked in" : status.allowed ? "Open" : "Locked"}</span>
      <button type="button" data-action="check-in" data-prayer="${prayer.id}" ${disabled ? "disabled" : ""}>
        ${attended ? "Done" : "Check in"}
      </button>
    </article>
  `;
}

function voucherView(user) {
  const availableToCreate = availableVoucherCount(state.attendances, state.vouchers, user.id);
  const vouchers = userVouchers(user.id);

  return `
    <section class="page-heading">
      <p class="eyebrow">Rewards</p>
      <h1>Voucher redemption</h1>
      <p>Every 5 verified mosque prayer check-ins earns one voucher redeemable at the mosque and future TBD retail or restaurant partners.</p>
    </section>

    <section class="panel split-panel">
      <div>
        <p class="eyebrow">Eligible vouchers</p>
        <strong class="big-number">${availableToCreate}</strong>
      </div>
      <button type="button" data-action="claim-voucher" ${availableToCreate < 1 ? "disabled" : ""}>Claim voucher</button>
    </section>

    <section class="cards-list">
      ${vouchers.map(voucherCard).join("") || emptyState("No vouchers yet", "Complete five mosque prayers to unlock your first voucher for mosque or future partner redemption.")}
    </section>
  `;
}

function voucherCard(voucher) {
  return `
    <article class="panel voucher ${voucher.status}">
      <div>
        <p class="eyebrow">${voucher.status}</p>
        <h2>${voucher.title}</h2>
        <p>Redeem at ${state.mosque.name}; future retail and restaurant partners are TBD. Created ${formatDate(voucher.createdAt)}</p>
      </div>
      <button type="button" data-action="redeem-voucher" data-voucher="${voucher.id}" ${voucher.status !== "available" ? "disabled" : ""}>
        ${voucher.status === "available" ? "Redeem" : "Redeemed"}
      </button>
    </article>
  `;
}

function sadaqahView(user) {
  const total = monthlySadaqahTotal(state.sadaqahPayments, user.id);
  const payments = state.sadaqahPayments
    .filter((payment) => payment.userId === user.id)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  return `
    <section class="page-heading">
      <p class="eyebrow">QRIS sadaqah</p>
      <h1>Digital giving</h1>
      <p>Your verified total for ${monthKey()} is ${formatRupiah(total)}. Static QRIS payments need admin verification before they count.</p>
    </section>

    <section class="sadaqah-layout">
      <article class="panel qris-panel">
        <img src="${state.mosque.qrisImage}" alt="Static QRIS code placeholder" />
        <p>Replace this placeholder with the mosque QRIS image when it is ready.</p>
      </article>

      <article class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Payment report</p>
            <h2>Submit after paying</h2>
          </div>
        </div>
        <form data-form="sadaqah">
          <label>
            Amount
            <input name="amount" inputmode="numeric" type="text" pattern="[0-9]*" value="25000" />
          </label>
          <label>
            Note
            <input name="note" type="text" maxlength="80" placeholder="Optional" />
          </label>
          <button type="submit">Submit for verification</button>
        </form>
      </article>
    </section>

    <section class="cards-list">
      ${payments
        .map(
          (payment) => `
            <article class="list-item">
              <div>
                <strong>${formatRupiah(payment.amount)}</strong>
                <p>${payment.note || "Sadaqah"} - ${formatDateTime(payment.paidAt)}</p>
              </div>
              <span class="pill ${payment.status === "verified" ? "good" : "pending"}">${payment.status}</span>
            </article>
          `
        )
        .join("") || emptyState("No sadaqah payments", "Payments you record will appear here.")}
    </section>
  `;
}

function reportsView(user) {
  const reports = weeklyUsageForUser(state.usageReports, user.id);

  return `
    <section class="page-heading">
      <p class="eyebrow">Transparency</p>
      <h1>Weekly sadaqah usage</h1>
      <p>Updates from the mosque when collected sadaqah has been used.</p>
    </section>

    <section class="timeline">
      ${reports
        .map(
          (report) => `
            <article class="panel report-card">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">${report.week}</p>
                  <h2>${report.title}</h2>
                </div>
                <strong>${formatRupiah(report.amountUsed)}</strong>
              </div>
              <p>${report.summary}</p>
              <small>Sent ${formatDate(report.sentAt)}</small>
            </article>
          `
        )
        .join("") || emptyState("No reports", "Admin reports will appear after publication.")}
    </section>
  `;
}

function adminView(user) {
  if (user.role !== "admin") {
    return emptyState("Admin access required", "Switch to the admin demo profile to manage the mosque.");
  }

  const totalSadaqah = state.sadaqahPayments
    .filter((payment) => payment.status === "verified")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const recentAttendances = [...state.attendances]
    .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt))
    .slice(0, 5);
  const recentPayments = [...state.sadaqahPayments]
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
    .slice(0, 5);

  return `
    <section class="page-heading">
      <p class="eyebrow">DKM operations</p>
      <h1>Admin console</h1>
      <p>Manage prayer times, weekly reports, sadaqah records, and community activity from one operational view.</p>
    </section>

    <section class="admin-console">
      <section class="metric-row" aria-label="Admin summary">
      ${metricCard("Registered users", state.users.length, "Demo profiles")}
      ${metricCard("Total check-ins", state.attendances.length, "All time")}
      ${metricCard("Verified sadaqah", formatRupiah(totalSadaqah), "All time")}
      </section>

      <section class="admin-main-grid">
        <article class="panel admin-table-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Recent activity</p>
              <h2>Attendance log</h2>
            </div>
          </div>
          <div class="console-table">
            <p class="console-row console-head"><span>Jamaah</span><span>Prayer</span><span>Time</span></p>
            ${recentAttendances
              .map(
                (attendance) => `
                  <p class="console-row">
                    <span>${userName(attendance.userId)}</span>
                    <span>${attendance.prayerName}</span>
                    <span>${formatDateTime(attendance.checkedInAt)}</span>
                  </p>
                `
              )
              .join("")}
          </div>
        </article>

        <article class="panel admin-table-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Finance</p>
              <h2>Sadaqah payments</h2>
            </div>
          </div>
          <div class="console-table">
            <p class="console-row payment-row console-head"><span>Jamaah</span><span>Amount</span><span>Status</span><span>Action</span></p>
            ${recentPayments
              .map(
                (payment) => `
                  <p class="console-row payment-row">
                    <span>${userName(payment.userId)}</span>
                    <span>${formatRupiah(payment.amount)}</span>
                    <span>${payment.status}</span>
                    <span>
                      ${
                        payment.status === "pending"
                          ? `<button type="button" class="table-action" data-action="verify-payment" data-payment="${payment.id}">Verify</button>`
                          : "Done"
                      }
                    </span>
                  </p>
                `
              )
              .join("")}
          </div>
        </article>
      </section>

      <section class="admin-grid">
        <article class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Prayer API</p>
              <h2>Bandung prayer times</h2>
            </div>
          </div>
          <div class="api-source-panel">
            <p>${prayerSourceText()}</p>
            <p>Provider: ${PRAYER_API.provider}. City: ${PRAYER_API.city}, ${PRAYER_API.country}.</p>
            <button type="button" data-action="refresh-prayers">
              ${state.prayerSource?.status === "syncing" ? "Syncing..." : "Refresh from API"}
            </button>
          </div>
          <div class="schedule-list">
            ${state.prayers
              .map((prayer) => `<p><span>${prayer.name}</span><strong>${prayer.time}</strong></p>`)
              .join("")}
          </div>
        </article>

        <article class="panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Weekly notification</p>
              <h2>Publish usage report</h2>
            </div>
          </div>
          <form data-form="usage-report">
            <label>
              Week
              <input name="week" type="text" value="${weekKey(new Date())}" />
            </label>
            <label>
              Title
              <input name="title" type="text" required value="Sadaqah usage update" />
            </label>
            <label>
              Amount used
              <input name="amountUsed" inputmode="numeric" type="text" pattern="[0-9]*" value="500000" />
            </label>
            <label>
              Summary
              <textarea name="summary" rows="4" required>Funds were used for mosque operations and jamaah services this week.</textarea>
            </label>
            <button type="submit">Publish report</button>
          </form>
        </article>
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Data</p>
            <h2>Demo controls</h2>
          </div>
        </div>
        <button type="button" class="danger" data-action="reset-demo">Reset demo data</button>
      </section>
    </section>
  `;
}

function metricCard(label, value, meta) {
  return `
    <article class="metric-card">
      <p>${label}</p>
      <strong>${value}</strong>
      <span>${meta}</span>
    </article>
  `;
}

function emptyState(title, copy) {
  return `
    <article class="empty-state">
      <strong>${title}</strong>
      <p>${copy}</p>
    </article>
  `;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-ID", { dateStyle: "medium" }).format(new Date(value));
}

function userName(userId) {
  return state.users.find((user) => user.id === userId)?.name ?? "Unknown";
}

function prayerSourceText() {
  const source = state.prayerSource;
  if (!source) return "Prayer times use fallback Bandung data.";
  if (source.status === "syncing") return "Prayer times are syncing from the public API.";

  const synced = source.syncedAt ? ` Last sync: ${formatDateTime(source.syncedAt)}.` : "";
  return `${source.message}${synced}`;
}

function dateKeyForSync(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekKey(date) {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 1));
  const diff = Math.floor((date - start) / 86400000);
  const week = Math.ceil((diff + start.getUTCDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function locationTitle() {
  if (locationState.status === "checking") return "Checking mosque radius";
  if (locationState.inside) return "Location verified";
  if (locationState.status === "outside") return "Outside check-in radius";
  if (locationState.status === "denied") return "Location permission needed";
  if (locationState.status === "unavailable") return "Location unavailable";
  return "Verify mosque location";
}

function verifyLocation() {
  if (!navigator.geolocation) {
    locationState = {
      status: "unavailable",
      inside: false,
      distance: null,
      message: "This browser does not support geolocation. Use a supported mobile browser at the mosque."
    };
    render();
    return;
  }

  locationState = {
    status: "checking",
    inside: false,
    distance: null,
    message: `Checking whether you are within ${state.mosque.checkInRadiusMeters} meters of ${state.mosque.name}.`
  };
  render();

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const result = isInsideMosqueLocation(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        },
        state.mosque
      );

      locationState = {
        status: result.inside ? "verified" : "outside",
        inside: result.inside,
        distance: result.distance,
        message: result.inside
          ? `You are within the mosque check-in radius. Estimated distance: ${result.distance} meters.`
          : `You appear to be ${result.distance} meters away. Check-in opens only inside the mosque radius.`
      };
      render();
    },
    () => {
      locationState = {
        status: "denied",
        inside: false,
        distance: null,
        message: "Allow location access to check in at the mosque."
      };
      render();
    },
    {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 10000
    }
  );
}

app.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    event.preventDefault();
    setView(nav.dataset.nav);
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;

  const user = activeUser();

  if (action.dataset.action === "login") {
    startSession(action.dataset.user);
  }

  if (action.dataset.action === "logout") {
    endSession();
  }

  if (action.dataset.action === "verify-location") {
    verifyLocation();
  }

  if (action.dataset.action === "refresh-prayers") {
    syncPrayerTimes(true);
  }

  if (action.dataset.action === "check-in") {
    const prayer = state.prayers.find((item) => item.id === action.dataset.prayer);
    const now = new Date();

    if (hasAttendance(state.attendances, user.id, prayer.id, now)) {
      flash = "You already checked in for this prayer today.";
      render();
      return;
    }

    const result = createAttendance({ userId: user.id, prayer, now, insideMosque: locationState.inside });
    if (!result.ok) {
      flash = result.error;
      render();
      return;
    }

    setState(
      {
        ...state,
        attendances: [...state.attendances, result.attendance]
      },
      `${prayer.name} attendance saved.`
    );
  }

  if (action.dataset.action === "claim-voucher") {
    const count = availableVoucherCount(state.attendances, state.vouchers, user.id);
    if (count < 1) return;

    setState(
      {
        ...state,
        vouchers: [...state.vouchers, createVoucher(user.id)]
      },
      "Voucher created."
    );
  }

  if (action.dataset.action === "redeem-voucher") {
    const voucher = state.vouchers.find((item) => item.id === action.dataset.voucher);
    const result = redeemVoucher(voucher);
    if (!result.ok) return;

    setState(
      {
        ...state,
        vouchers: state.vouchers.map((item) => (item.id === result.voucher.id ? result.voucher : item))
      },
      "Voucher redeemed."
    );
  }

  if (action.dataset.action === "verify-payment") {
    const payment = state.sadaqahPayments.find((item) => item.id === action.dataset.payment);
    const result = verifySadaqahPayment(payment);
    if (!result.ok) return;

    setState(
      {
        ...state,
        sadaqahPayments: state.sadaqahPayments.map((item) =>
          item.id === result.payment.id ? result.payment : item
        )
      },
      "Sadaqah payment verified."
    );
  }

  if (action.dataset.action === "reset-demo") {
    state = resetState();
    flash = "Demo data reset.";
    render();
  }
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-action='switch-user']")) {
    switchUser(event.target.value);
  }
});

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const user = activeUser();

  if (form.dataset.form === "sadaqah") {
    const result = createSadaqahPayment({
      userId: user.id,
      amount: data.get("amount"),
      note: data.get("note")
    });

    if (!result.ok) {
      flash = result.error;
      render();
      return;
    }

    setState(
      {
        ...state,
        sadaqahPayments: [...state.sadaqahPayments, result.payment]
      },
      "Sadaqah payment submitted for admin verification."
    );
  }

  if (form.dataset.form === "usage-report") {
    const amountUsed = Number(data.get("amountUsed"));
    const report = {
      id: `rep_${Date.now()}`,
      week: String(data.get("week")),
      audience: "all",
      title: String(data.get("title")),
      amountUsed: Number.isFinite(amountUsed) ? amountUsed : 0,
      summary: String(data.get("summary")),
      sentAt: new Date().toISOString()
    };

    setState(
      {
        ...state,
        usageReports: [report, ...state.usageReports]
      },
      "Weekly notification published."
    );
  }
});

render();
