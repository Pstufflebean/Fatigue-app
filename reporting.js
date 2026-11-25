
// =====================================================
// ATLAS EMERGENCY SYSTEMS
// FATIGUE ASSESSMENT REPORTING MODULE
// =====================================================

// =====================================================
// REPORTING CONFIGURATION
// =====================================================

const REPORT_CONFIG = Object.freeze({
  agencyId: "LCAD",
  agencyName: "Linn County Ambulance District",
  companyName: "Atlas Emergency Systems",
  timeZone: "America/Chicago",
  highRiskThreshold: 12,
  morningStart: 7,
  morningEnd: 10,
  overnightStart: 22,
  overnightEnd: 6
});

// =====================================================
// CENTRAL TIME DATE HELPERS
// =====================================================

function getReportingDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: REPORT_CONFIG.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  );

  const parts = formatter.formatToParts(date);

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return {
    year: Number(result.year),
    month: Number(result.month),
    day: Number(result.day)
  };
}

function formatReportingDate(date = new Date()) {
  const parts = getReportingDateParts(date);

  return [
    String(parts.year),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

// =====================================================
// INITIALIZE REPORTING INTERFACE
// =====================================================

let reportingInitialized = false;

function initializeReporting() {
  if (reportingInitialized) {
    return;
  }

  const today = getReportingDateParts();

  const monthInput =
    document.getElementById("reportMonth");

  const yearInput =
    document.getElementById("reportYear");

  const startInput =
    document.getElementById("reportStartDate");

  const endInput =
    document.getElementById("reportEndDate");

  monthInput.value = String(today.month);

  yearInput.value = String(today.year);
  yearInput.max = String(today.year);

  const todayString = formatReportingDate();

  const firstOfMonth = [
    String(today.year),
    String(today.month).padStart(2, "0"),
    "01"
  ].join("-");

  startInput.value = firstOfMonth;
  endInput.value = todayString;

  startInput.max = todayString;
  endInput.max = todayString;

  updateReportingFields();

  reportingInitialized = true;
}

// =====================================================
// OPEN REPORTING VIEW
// =====================================================

function openReporting() {
  const adminPanel =
    document.getElementById("adminPanel");

  const loginPanel =
    document.getElementById("login");

  // Preserve the existing admin login workflow.
  // This is interface-level control only.

  if (
    !adminPanel ||
    !loginPanel ||
    getComputedStyle(adminPanel).display === "none" ||
    getComputedStyle(loginPanel).display !== "none"
  ) {
    return;
  }

  initializeReporting();

  document
    .getElementById("assessmentView")
    .style.display = "none";

  document
    .getElementById("reportingView")
    .style.display = "block";

  window.scrollTo(0, 0);
}

// =====================================================
// RETURN TO ASSESSMENTS
// =====================================================

function closeReporting() {
  document
    .getElementById("reportingView")
    .style.display = "none";

  document
    .getElementById("assessmentView")
    .style.display = "block";

  // Existing assessment records remain in the page.
  // Returning does not require another password entry.

  window.scrollTo(0, 0);
}

// =====================================================
// REPORTING PERIOD SELECTION
// =====================================================

function updateReportingFields() {
  const period =
    document.getElementById("reportPeriod").value;

  const monthFields =
    document.getElementById("reportMonthFields");

  const customFields =
    document.getElementById("reportCustomFields");

  monthFields.style.display = "none";
  customFields.style.display = "none";

  if (period === "month") {
    monthFields.style.display = "grid";
  }

  if (period === "custom") {
    customFields.style.display = "grid";
  }
}

// =====================================================
// REPORT GENERATION
// =====================================================
// The PDF button remains disabled until the reporting
// analytics and PDF generation functionality is installed.

function generateFatigueReport() {
  const status =
    document.getElementById("reportingStatus");

  status.textContent =
    "PDF generation has not been enabled yet.";
}
