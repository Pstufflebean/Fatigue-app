
// =====================================================
// ATLAS EMERGENCY SYSTEMS
// FATIGUE ASSESSMENT REPORTING MODULE
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
  overnightEnd: 6,
  pageSize: 500,
  answerBatchSize: 40
});

const REPORT_QUESTION_IDS = Object.freeze({
  peerSupport:
    "8ecad03b-9e35-4fc0-aaa4-cfb4bd5647c5",

  providerName:
    "c93bd0a1-3247-4821-b7fa-9cb7fd03874b",

  selfAssessment:
    "1e022b95-67ae-42bb-90c3-9675b621517b"
});

const REPORT_RISK_LEVELS = [
  "GREEN",
  "YELLOW",
  "ORANGE",
  "RED"
];

const REPORT_SELF_LABELS = [
  "Good to go",
  "Tired but OK",
  "Getting worn down",
  "Done for"
];

let reportingInitialized = false;
let reportingBusy = false;
let latestFatigueReport = null;

// =====================================================
// CENTRAL TIME HELPERS
// =====================================================

const reportDateFormatter =
  new Intl.DateTimeFormat("en-US", {
    timeZone: REPORT_CONFIG.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

function getReportingDateParts(date = new Date()) {
  const result = {};

  for (
    const part of
    reportDateFormatter.formatToParts(date)
  ) {
    if (part.type !== "literal") {
      result[part.type] = Number(part.value);
    }
  }

  return result;
}

function formatReportingDate(date = new Date()) {
  const parts = getReportingDateParts(date);

  return [
    String(parts.year),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function reportAddDays(dateString, days) {
  const date = new Date(
    dateString + "T00:00:00Z"
  );

  date.setUTCDate(
    date.getUTCDate() + days
  );

  return date.toISOString().slice(0, 10);
}

function reportValidDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(value + "T00:00:00Z");

  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

// Convert Central Time calendar dates to UTC.
// Handles standard and daylight saving time.

function reportLocalToUTC(
  dateString,
  hour = 0
) {
  const [year, month, day] =
    dateString.split("-").map(Number);

  const target = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    0,
    0
  );

  let guess = target;

  for (let i = 0; i < 4; i++) {
    const parts = getReportingDateParts(
      new Date(guess)
    );

    const observed = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );

    const difference = target - observed;

    if (difference === 0) {
      return new Date(guess).toISOString();
    }

    guess += difference;
  }

  throw new Error(
    "Unable to convert reporting date"
  );
}

function reportMonthEnd(year, month) {
  return new Date(
    Date.UTC(year, month, 0)
  ).toISOString().slice(0, 10);
}

function reportRound(value, decimals = 2) {
  return Number(
    Number(value).toFixed(decimals)
  );
}

function reportPercentage(count, total) {
  return total > 0
    ? reportRound(count / total * 100, 1)
    : 0;
}

// =====================================================
// INITIALIZE REPORTING INTERFACE
// =====================================================

function initializeReporting() {
  if (reportingInitialized) {
    return;
  }

  const today = getReportingDateParts();
  const todayString = formatReportingDate();

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

  startInput.value = [
    String(today.year),
    String(today.month).padStart(2, "0"),
    "01"
  ].join("-");

  endInput.value = todayString;

  startInput.max = todayString;
  endInput.max = todayString;

  const generateButton =
    document.getElementById(
      "generateReportButton"
    );

  generateButton.disabled = false;
  generateButton.textContent =
    "Preview Report Statistics";

  document.getElementById(
    "reportingStatus"
  ).textContent =
    "Select a reporting period to calculate statistics.";

  updateReportingFields();

  reportingInitialized = true;
}

// =====================================================
// ADMIN VIEW NAVIGATION
// =====================================================

function reportingAdminVisible() {
  const adminPanel =
    document.getElementById("adminPanel");

  const loginPanel =
    document.getElementById("login");

  return Boolean(
    adminPanel &&
    loginPanel &&
    getComputedStyle(adminPanel).display !== "none" &&
    getComputedStyle(loginPanel).display === "none"
  );
}

function openReporting() {
  if (!reportingAdminVisible()) {
    return;
  }

  initializeReporting();

  document.getElementById(
    "assessmentView"
  ).style.display = "none";

  document.getElementById(
    "reportingView"
  ).style.display = "block";

  window.scrollTo(0, 0);
}

function closeReporting() {
  if (reportingBusy) {
    return;
  }

  document.getElementById(
    "reportingView"
  ).style.display = "none";

  document.getElementById(
    "assessmentView"
  ).style.display = "block";

  window.scrollTo(0, 0);
}

function updateReportingFields() {
  const period =
    document.getElementById("reportPeriod").value;

  document.getElementById(
    "reportMonthFields"
  ).style.display =
    period === "month" ? "grid" : "none";

  document.getElementById(
    "reportCustomFields"
  ).style.display =
    period === "custom" ? "grid" : "none";
}

// =====================================================
// DETERMINE REPORTING DATE RANGE
// =====================================================

async function getReportingRange() {
  const period =
    document.getElementById("reportPeriod").value;

  const today = formatReportingDate();

  let startDate;
  let endDate = today;

  if (["7", "30", "90"].includes(period)) {

    // Includes today as the final calendar day.

    startDate = reportAddDays(
      today,
      1 - Number(period)
    );

  } else if (period === "ytd") {

    startDate = today.slice(0, 4) + "-01-01";

  } else if (period === "month") {

    const month = Number(
      document.getElementById("reportMonth").value
    );

    const year = Number(
      document.getElementById("reportYear").value
    );

    if (
      !Number.isInteger(year) ||
      year < 2000 ||
      year > Number(today.slice(0, 4)) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new Error(
        "Select a valid calendar month and year."
      );
    }

    startDate =
      String(year) + "-" +
      String(month).padStart(2, "0") +
      "-01";

    endDate = reportMonthEnd(year, month);

  } else if (period === "custom") {

    startDate =
      document.getElementById(
        "reportStartDate"
      ).value;

    endDate =
      document.getElementById(
        "reportEndDate"
      ).value;

  } else if (period === "all") {

    const { data, error } =
      await supabaseClient
        .from("assessments")
        .select("created_at")
        .eq("agency_id", REPORT_CONFIG.agencyId)
        .order("created_at", {
          ascending: true
        })
        .limit(1);

    if (error) {
      throw new Error(
        "Unable to determine historical date range."
      );
    }

    if (!data?.length) {
      startDate = today;
    } else {
      const earliest =
        new Date(data[0].created_at);

      startDate =
        formatReportingDate(earliest);

      // Include the first operational night if the
      // earliest record was completed after midnight.

      if (
        getReportingDateParts(earliest).hour <
        REPORT_CONFIG.overnightEnd
      ) {
        startDate = reportAddDays(startDate, -1);
      }
    }

  } else {
    throw new Error(
      "Invalid reporting period."
    );
  }

  if (
    !reportValidDate(startDate) ||
    !reportValidDate(endDate) ||
    startDate > endDate ||
    startDate > today
  ) {
    throw new Error(
      "Select a valid reporting date range."
    );
  }

  // Current-month reports end on the current date.

  if (endDate > today) {
    endDate = today;
  }

  const nextDate = reportAddDays(endDate, 1);

  return {
    startDate,
    endDate,
    startUTC: reportLocalToUTC(startDate),
    endUTC: reportLocalToUTC(nextDate),

    // Include the next morning through 0559
    // for the final operational night.

    overnightEndUTC:
      reportLocalToUTC(nextDate, 6),

    generatedAt: new Date().toISOString()
  };
}

// =====================================================
// RETRIEVE ASSESSMENTS
// =====================================================

async function loadReportingAssessments(range) {
  const assessments = [];
  const pageSize = REPORT_CONFIG.pageSize;

  // Never include records created after the report
  // generation timestamp.

  const queryEnd = new Date(
    Math.min(
      new Date(range.overnightEndUTC).getTime(),
      new Date(range.generatedAt).getTime()
    )
  ).toISOString();

  let offset = 0;

  while (true) {
    const { data, error } =
      await supabaseClient
        .from("assessments")
        .select(
          "id, agency_id, created_at, " +
          "total_score, risk_color"
        )
        .eq("agency_id", REPORT_CONFIG.agencyId)
        .gte("created_at", range.startUTC)
        .lt("created_at", queryEnd)
        .order("created_at", {
          ascending: true
        })
        .order("id", {
          ascending: true
        })
        .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        "Unable to retrieve assessment records."
      );
    }

    assessments.push(...(data || []));

    if (!data || data.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return assessments;
}

// =====================================================
// RETRIEVE HISTORICAL ANSWERS
// =====================================================

async function loadReportingAnswers(assessments) {
  const result = new Map();

  const ids = assessments.map(
    assessment => assessment.id
  );

  const batchSize =
    REPORT_CONFIG.answerBatchSize;

  for (
    let start = 0;
    start < ids.length;
    start += batchSize
  ) {
    const batch = ids.slice(
      start,
      start + batchSize
    );

    let offset = 0;

    while (true) {
      const { data, error } =
        await supabaseClient
          .from("answers")
          .select(
            "assessment_id, question_id, " +
            "weighted_score"
          )
          .in("assessment_id", batch)
          .order("assessment_id", {
            ascending: true
          })
          .order("question_id", {
            ascending: true
          })
          .range(
            offset,
            offset + REPORT_CONFIG.pageSize - 1
          );

      if (error) {
        throw new Error(
          "Unable to retrieve historical scoring records."
        );
      }

      for (const answer of data || []) {
        if (!result.has(answer.assessment_id)) {
          result.set(answer.assessment_id, []);
        }

        result.get(
          answer.assessment_id
        ).push(answer);
      }

      if (
        !data ||
        data.length < REPORT_CONFIG.pageSize
      ) {
        break;
      }

      offset += REPORT_CONFIG.pageSize;
    }
  }

  return result;
}

// =====================================================
// RETRIEVE ONLY REQUIRED RESPONSE VALUES
// =====================================================
// Provider names and other text responses are not
// retrieved by the reporting module.

async function loadReportingResponseValues(
  assessments
) {
  const result = new Map();

  const ids = assessments.map(
    assessment => assessment.id
  );

  const batchSize =
    REPORT_CONFIG.answerBatchSize;

  for (
    let start = 0;
    start < ids.length;
    start += batchSize
  ) {
    const batch = ids.slice(
      start,
      start + batchSize
    );

    const { data, error } =
      await supabaseClient
        .from("answers")
        .select(
          "assessment_id, question_id, value"
        )
        .in("assessment_id", batch)
        .in("question_id", [
          REPORT_QUESTION_IDS.peerSupport,
          REPORT_QUESTION_IDS.selfAssessment
        ]);

    if (error) {
      throw new Error(
        "Unable to retrieve reporting response values."
      );
    }

    for (const answer of data || []) {
      if (!result.has(answer.assessment_id)) {
        result.set(answer.assessment_id, []);
      }

      result.get(
        answer.assessment_id
      ).push(answer);
    }
  }

  return result;
}

// =====================================================
// DAILY PARTICIPATION ANALYSIS
// =====================================================

function calculateDailyParticipation(
  assessments,
  range
) {
  const days = new Map();

  let date = range.startDate;

  // Include zero-count dates.

  while (date <= range.endDate) {
    days.set(date, {
      date,
      morning: 0,
      overnight: 0,
      overnightComplete:
        new Date(
          reportLocalToUTC(
            reportAddDays(date, 1),
            6
          )
        ).getTime() <=
        new Date(range.generatedAt).getTime()
    });

    date = reportAddDays(date, 1);
  }

  for (const assessment of assessments) {
    const timestamp =
      new Date(assessment.created_at);

    const parts =
      getReportingDateParts(timestamp);

    const calendarDate =
      formatReportingDate(timestamp);

    // Morning: 0700 through 0959.

    if (
      parts.hour >= REPORT_CONFIG.morningStart &&
      parts.hour < REPORT_CONFIG.morningEnd
    ) {
      if (days.has(calendarDate)) {
        days.get(calendarDate).morning++;
      }
    }

    // Overnight: 2200 through 0559.
    // After midnight, assign to the previous date.

    if (
      parts.hour >= REPORT_CONFIG.overnightStart ||
      parts.hour < REPORT_CONFIG.overnightEnd
    ) {
      const operationalDate =
        parts.hour < REPORT_CONFIG.overnightEnd
          ? reportAddDays(calendarDate, -1)
          : calendarDate;

      if (days.has(operationalDate)) {
        days.get(operationalDate).overnight++;
      }
    }
  }

  const daily = [...days.values()];

  return {
    daily,

    totalMorning: daily.reduce(
      (sum, day) => sum + day.morning,
      0
    ),

    totalOvernight: daily.reduce(
      (sum, day) => sum + day.overnight,
      0
    ),

    zeroOvernightDays: daily.filter(
      day =>
        day.overnightComplete &&
        day.overnight === 0
    ).length,

    incompleteOvernightDays: daily.filter(
      day => !day.overnightComplete
    ).length
  };
}

// =====================================================
// FATIGUE RISK DISTRIBUTION
// =====================================================

function calculateRiskDistribution(assessments) {
  const counts = {
    GREEN: 0,
    YELLOW: 0,
    ORANGE: 0,
    RED: 0,
    UNKNOWN: 0
  };

  for (const assessment of assessments) {
    const risk = String(
      assessment.risk_color || ""
    ).toUpperCase();

    if (REPORT_RISK_LEVELS.includes(risk)) {
      counts[risk]++;
    } else {
      counts.UNKNOWN++;
    }
  }

  return Object.entries(counts).map(
    ([risk, count]) => ({
      risk,
      count,
      percentage: reportPercentage(
        count,
        assessments.length
      )
    })
  );
}

// =====================================================
// CONTRIBUTING FATIGUE FACTORS
// =====================================================
// Uses the existing CATEGORIES and CATEGORY_LOOKUP
// definitions from admin.js.
//
// Preserves saved weighted scores.
// Does not recalculate historical question scores.

function calculateContributingFactors(
  assessments,
  answerMap
) {
  const totals = Object.fromEntries(
    CATEGORIES.map(
      category => [category.key, 0]
    )
  );

  let unclassifiedPoints = 0;
  let discrepantAssessments = 0;
  let missingAnswerAssessments = 0;
  let invalidScoreAssessments = 0;
  let inferredCircadianAssessments = 0;

  for (const assessment of assessments) {
    const answers =
      answerMap.get(assessment.id) || [];

    if (!answers.length) {
      missingAnswerAssessments++;
      continue;
    }

    if (
      assessment.total_score === null ||
      assessment.total_score === "" ||
      !Number.isFinite(
        Number(assessment.total_score)
      )
    ) {
      invalidScoreAssessments++;
      continue;
    }

    let storedQuestionTotal = 0;
    let invalidAnswer = false;

    const subtotals = Object.fromEntries(
      CATEGORIES.map(
        category => [category.key, 0]
      )
    );

    let assessmentUnclassified = 0;

    for (const answer of answers) {
      const points =
        Number(answer.weighted_score);

      if (
        answer.weighted_score === null ||
        answer.weighted_score === "" ||
        !Number.isFinite(points) ||
        points < 0
      ) {
        invalidAnswer = true;
        break;
      }

      storedQuestionTotal += points;

      const category =
        CATEGORY_LOOKUP.get(answer.question_id);

      if (category) {
        subtotals[category] += points;
      } else {
        assessmentUnclassified += points;
      }
    }

    if (invalidAnswer) {
      invalidScoreAssessments++;
      continue;
    }

    const residual = reportRound(
      Number(assessment.total_score) -
      storedQuestionTotal
    );

    // Follow the existing administrator methodology.
    // A residual of 0, 1 or 2 is consistent with
    // the historical circadian adjustment.

    if ([0, 1, 2].includes(residual)) {
      subtotals.circadian += residual;

      if (residual > 0) {
        inferredCircadianAssessments++;
      }

    } else {
      // Do not silently assign unexplained points
      // to a fatigue category.

      discrepantAssessments++;
    }

    for (const category of CATEGORIES) {
      totals[category.key] +=
        subtotals[category.key];
    }

    unclassifiedPoints +=
      assessmentUnclassified;
  }

  const totalAttributedPoints =
    Object.values(totals).reduce(
      (sum, value) => sum + value,
      0
    ) + unclassifiedPoints;

  const categories = CATEGORIES.map(
    category => ({
      key: category.key,
      title: category.title,
      points: reportRound(
        totals[category.key]
      ),
      percentage: reportPercentage(
        totals[category.key],
        totalAttributedPoints
      )
    })
  );

  if (unclassifiedPoints > 0) {
    categories.push({
      key: "unclassified",
      title: "Unclassified Scoring Points",
      points: reportRound(unclassifiedPoints),
      percentage: reportPercentage(
        unclassifiedPoints,
        totalAttributedPoints
      )
    });
  }

  categories.sort(
    (a, b) => b.points - a.points
  );

  return {
    categories,
    totalAttributedPoints:
      reportRound(totalAttributedPoints),

    discrepantAssessments,
    missingAnswerAssessments,
    invalidScoreAssessments,
    inferredCircadianAssessments
  };
}

// =====================================================
// PROVIDER SELF-ASSESSMENT ANALYSIS
// =====================================================

function calculateSelfAssessment(
  assessments,
  responseMap
) {
  const counts = [0, 0, 0, 0];

  let missingResponses = 0;
  let goodToGoElevatedRisk = 0;
  let goodToGoHighRisk = 0;

  const comparison = REPORT_SELF_LABELS.map(
    (label, value) => ({
      value,
      label,
      GREEN: 0,
      YELLOW: 0,
      ORANGE: 0,
      RED: 0,
      UNKNOWN: 0
    })
  );

  for (const assessment of assessments) {
    const responses =
      responseMap.get(assessment.id) || [];

    const answer = responses.find(
      item =>
        item.question_id ===
        REPORT_QUESTION_IDS.selfAssessment
    );

    if (
      !answer ||
      answer.value === null ||
      answer.value === ""
    ) {
      missingResponses++;
      continue;
    }

    const value = Number(answer.value);

    if (
      !Number.isInteger(value) ||
      value < 0 ||
      value > 3
    ) {
      missingResponses++;
      continue;
    }

    counts[value]++;

    const risk = String(
      assessment.risk_color || ""
    ).toUpperCase();

    const riskKey =
      REPORT_RISK_LEVELS.includes(risk)
        ? risk
        : "UNKNOWN";

    comparison[value][riskKey]++;

    if (value === 0) {
      if (
        risk === "ORANGE" ||
        risk === "RED"
      ) {
        goodToGoElevatedRisk++;
      }

      if (
        Number(assessment.total_score) >
        REPORT_CONFIG.highRiskThreshold
      ) {
        goodToGoHighRisk++;
      }
    }
  }

  const totalResponses = counts.reduce(
    (sum, value) => sum + value,
    0
  );

  return {
    distribution: REPORT_SELF_LABELS.map(
      (label, value) => ({
        value,
        label,
        count: counts[value],
        percentage: reportPercentage(
          counts[value],
          totalResponses
        )
      })
    ),

    totalResponses,
    missingResponses,
    comparison,
    goodToGoElevatedRisk,
    goodToGoHighRisk
  };
}

// =====================================================
// EXECUTIVE SUMMARY
// =====================================================

function calculateExecutiveSummary(
  assessments,
  responseMap
) {
  const validScores = assessments
    .filter(
      assessment =>
        assessment.total_score !== null &&
        assessment.total_score !== "" &&
        Number.isFinite(
          Number(assessment.total_score)
        )
    )
    .map(
      assessment => Number(assessment.total_score)
    );

  let peerSupportRequests = 0;
  let peerSupportMissing = 0;

  for (const assessment of assessments) {
    const responses =
      responseMap.get(assessment.id) || [];

    const answer = responses.find(
      item =>
        item.question_id ===
        REPORT_QUESTION_IDS.peerSupport
    );

    if (
      !answer ||
      answer.value === null ||
      answer.value === "" ||
      ![0, 1].includes(Number(answer.value))
    ) {
      peerSupportMissing++;
      continue;
    }

    if (Number(answer.value) === 1) {
      peerSupportRequests++;
    }
  }

  const totalScore = validScores.reduce(
    (sum, value) => sum + value,
    0
  );

  return {
    totalAssessments: assessments.length,

    averageScore: validScores.length
      ? reportRound(
          totalScore / validScores.length,
          1
        )
      : null,

    highRisk: validScores.filter(
      score =>
        score > REPORT_CONFIG.highRiskThreshold
    ).length,

    peerSupportRequests,

    peerSupportMissing,

    validScoreCount: validScores.length,

    missingScoreCount:
      assessments.length - validScores.length
  };
}

// =====================================================
// ADMINISTRATIVE RECOMMENDATIONS
// =====================================================

function calculateRecommendations(report) {
  const recommendations = [];

  const summary = report.summary;

  if (!summary.totalAssessments) {
    return [{
      title: "Insufficient assessment data",
      text:
        "No completed assessments were recorded " +
        "within the selected calendar reporting period. " +
        "Verify the reporting dates before drawing " +
        "conclusions about workforce fatigue."
    }];
  }

  // HIGH RISK

  if (summary.highRisk > 0) {
    recommendations.push({
      title: "High-risk assessment review",
      text:
        `${summary.highRisk} assessments exceeded ` +
        "a fatigue score of 12. Review these events " +
        "against established fatigue mitigation and " +
        "supervisory intervention procedures."
    });
  } else if (summary.missingScoreCount === 0) {
    recommendations.push({
      title: "High-risk assessment monitoring",
      text:
        "No recorded assessment exceeded a fatigue " +
        "score of 12. Continue monitoring and " +
        "maintaining established fatigue controls."
    });
  } else {
    recommendations.push({
      title: "High-risk data limitations",
      text:
        "No available score exceeded 12, but some " +
        "assessments have missing or invalid scores. " +
        "Review record completeness."
    });
  }

  // CONTRIBUTING FATIGUE FACTORS

  const topFactor =
    report.factors.categories.find(
      item => item.points > 0
    );

  if (topFactor) {
    const guidance = {
      rest:
        "Review opportunities for restorative rest " +
        "and fatigue recovery.",

      debt:
        "Review cumulative sleep loss, recovery " +
        "periods, and shift scheduling practices.",

      workload:
        "Review call volume, duty hours, transport " +
        "burden, and workload distribution.",

      circadian:
        "Review overnight operational demands and " +
        "rest opportunities during periods of " +
        "circadian vulnerability.",

      additional:
        "Review environmental, psychosocial, and " +
        "other contributing risk factors.",

      unclassified:
        "Review historical question mappings and " +
        "scoring records."
    };

    recommendations.push({
      title: "Primary contributing fatigue factor",
      text:
        `${topFactor.title} accounted for ` +
        `${topFactor.percentage}% of attributable ` +
        "fatigue scoring points. " +
        (guidance[topFactor.key] ||
          "Review relevant operational controls.")
    });
  }

  // OVERNIGHT PARTICIPATION

  if (
    report.participation.zeroOvernightDays > 0
  ) {
    recommendations.push({
      title: "Overnight assessment participation",
      text:
        `${report.participation.zeroOvernightDays} ` +
        "completed operational nights recorded no " +
        "overnight assessments. Compare these dates " +
        "with staffing, call activity, and assessment " +
        "requirements before determining whether " +
        "compliance concerns exist."
    });
  }

  // SELF-ASSESSMENT DISCREPANCIES

  if (
    report.selfAssessment.goodToGoElevatedRisk > 0
  ) {
    recommendations.push({
      title: "Provider fatigue awareness",
      text:
        `${report.selfAssessment.goodToGoElevatedRisk} ` +
        "assessments indicated that providers felt " +
        "'Good to go' despite a calculated ORANGE " +
        "or RED risk classification. Consider " +
        "education concerning fatigue recognition " +
        "and objective risk indicators."
    });
  }

  // PEER SUPPORT

  if (summary.peerSupportRequests > 0) {
    recommendations.push({
      title: "Peer-support resources",
      text:
        `${summary.peerSupportRequests} assessments ` +
        "included requests for peer-support resources. " +
        "Review resource availability and confidential " +
        "follow-up procedures without identifying " +
        "individual providers in this report."
    });
  }

  // DATA QUALITY

  const factorIssues =
    report.factors.discrepantAssessments +
    report.factors.missingAnswerAssessments +
    report.factors.invalidScoreAssessments;

  if (
    factorIssues > 0 ||
    summary.missingScoreCount > 0 ||
    report.selfAssessment.missingResponses > 0 ||
    summary.peerSupportMissing > 0 ||
    report.riskDistribution.some(
      item =>
        item.risk === "UNKNOWN" &&
        item.count > 0
    )
  ) {
    recommendations.push({
      title: "Reporting data quality",
      text:
        "Some assessment records contain missing, " +
        "unclassified, or unreconciled scoring data. " +
        "Review these limitations before drawing " +
        "conclusions from aggregate statistics."
    });
  }

  return recommendations;
}

// =====================================================
// BUILD COMPLETE REPORT DATA
// =====================================================

async function buildFatigueReport() {
  const range = await getReportingRange();

  const allAssessments =
    await loadReportingAssessments(range);

  // The executive summary and other aggregate
  // sections use actual calendar completion dates.
  //
  // Additional next-day records are used only for
  // the final operational-night participation count.

  const assessments = allAssessments.filter(
    assessment => {
      const timestamp =
        new Date(assessment.created_at).getTime();

      return (
        timestamp >=
          new Date(range.startUTC).getTime() &&
        timestamp <
          new Date(range.endUTC).getTime()
      );
    }
  );

  const historicalScores =
    await loadReportingAnswers(assessments);

  const responseValues =
    await loadReportingResponseValues(
      assessments
    );

  const report = {
    agencyId: REPORT_CONFIG.agencyId,
    agencyName: REPORT_CONFIG.agencyName,
    companyName: REPORT_CONFIG.companyName,

    range,

    summary: calculateExecutiveSummary(
      assessments,
      responseValues
    ),

    riskDistribution:
      calculateRiskDistribution(assessments),

    participation:
      calculateDailyParticipation(
        allAssessments,
        range
      ),

    factors:
      calculateContributingFactors(
        assessments,
        historicalScores
      ),

    selfAssessment:
      calculateSelfAssessment(
        assessments,
        responseValues
      )
  };

  report.recommendations =
    calculateRecommendations(report);

  return report;
}

// =====================================================
// TEMPORARY REPORT STATISTICS PREVIEW
// =====================================================

function renderReportingPreview(report) {
  const status =
    document.getElementById("reportingStatus");

  status.replaceChildren();

  const preview = document.createElement("div");

  preview.style.cssText = `
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 18px;
    margin-top: 15px;
    color: #173b62;
    line-height: 1.7;
  `;

  function addHeading(text) {
    const heading = document.createElement("h3");

    heading.textContent = text;

    heading.style.cssText = `
      margin: 18px 0 8px;
      font-size: 16px;
      color: #173b62;
    `;

    preview.appendChild(heading);
  }

  function addRow(label, value) {
    const row = document.createElement("div");

    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 15px;
      padding: 7px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 14px;
      color: #334155;
    `;

    const name = document.createElement("span");
    name.textContent = label;

    const amount =
      document.createElement("strong");

    amount.textContent = String(value);
    amount.style.textAlign = "right";

    row.append(name, amount);
    preview.appendChild(row);
  }

  function addParagraph(text) {
    const paragraph =
      document.createElement("p");

    paragraph.textContent = text;

    paragraph.style.cssText = `
      font-size: 13px;
      color: #475569;
      margin: 8px 0;
    `;

    preview.appendChild(paragraph);
  }

  addHeading("Report Statistics");

  addParagraph(
    report.range.startDate +
    " through " +
    report.range.endDate
  );

  addHeading("1. Executive Summary");

  addRow(
    "Total Assessments",
    report.summary.totalAssessments
  );

  addRow(
    "Average Fatigue Score",
    report.summary.averageScore === null
      ? "N/A"
      : report.summary.averageScore.toFixed(1)
  );

  addRow(
    "High Risk (>12)",
    report.summary.highRisk
  );

  addRow(
    "Peer-Support Requests",
    report.summary.peerSupportRequests
  );

  addHeading("2. Fatigue Risk Distribution");

  for (const risk of report.riskDistribution) {
    if (
      risk.risk === "UNKNOWN" &&
      risk.count === 0
    ) {
      continue;
    }

    addRow(
      risk.risk,
      `${risk.count} (${risk.percentage}%)`
    );
  }

  addHeading("3. Daily Assessment Participation");

  addRow(
    "Morning Assessments",
    report.participation.totalMorning
  );

  addRow(
    "Overnight Assessments",
    report.participation.totalOvernight
  );

  addRow(
    "Completed Nights Without Assessments",
    report.participation.zeroOvernightDays
  );

  addRow(
    "Incomplete Operational Nights",
    report.participation.incompleteOvernightDays
  );

  addHeading("4. Contributing Fatigue Factors");

  for (const factor of report.factors.categories) {
    addRow(
      factor.title,
      `${factor.points} pts (${factor.percentage}%)`
    );
  }

  addRow(
    "Unreconciled Assessments",
    report.factors.discrepantAssessments
  );

  addRow(
    "Assessments Missing Answers",
    report.factors.missingAnswerAssessments
  );

  addRow(
    "Invalid Scoring Records",
    report.factors.invalidScoreAssessments
  );

  addParagraph(
    "Circadian contributions are inferred from " +
    "historical score differences where consistent " +
    "with the established scoring rules."
  );

  addHeading("5. Provider Self-Assessment");

  for (
    const item of
    report.selfAssessment.distribution
  ) {
    addRow(
      item.label,
      `${item.count} (${item.percentage}%)`
    );
  }

  addRow(
    "Good to Go with ORANGE or RED Risk",
    report.selfAssessment.goodToGoElevatedRisk
  );

  addRow(
    "Good to Go with Score >12",
    report.selfAssessment.goodToGoHighRisk
  );

  addRow(
    "Missing or Invalid Responses",
    report.selfAssessment.missingResponses
  );

  addHeading("6. Administrative Recommendations");

  for (
    const recommendation of report.recommendations
  ) {
    const title = document.createElement("strong");

    title.textContent = recommendation.title;
    preview.appendChild(title);

    addParagraph(recommendation.text);
  }

  addHeading("Data Quality");

  addRow(
    "Missing or Invalid Scores",
    report.summary.missingScoreCount
  );

  addRow(
    "Missing Peer-Support Responses",
    report.summary.peerSupportMissing
  );

  addParagraph(
    "The preview uses actual saved assessment data. " +
    "Provider names are excluded. PDF generation " +
    "will be added in the next development stage."
  );

  status.appendChild(preview);
}

// =====================================================
// GENERATE REPORT STATISTICS
// =====================================================

async function generateFatigueReport() {
  if (
    reportingBusy ||
    !reportingAdminVisible() ||
    getComputedStyle(
      document.getElementById("reportingView")
    ).display === "none"
  ) {
    return;
  }

  reportingBusy = true;
  latestFatigueReport = null;

  const button =
    document.getElementById(
      "generateReportButton"
    );

  const status =
    document.getElementById("reportingStatus");

  button.disabled = true;

  button.textContent =
    "Calculating Report...";

  status.textContent =
    "Retrieving assessment records and " +
    "calculating report statistics...";

  try {
    latestFatigueReport =
      await buildFatigueReport();

    renderReportingPreview(
      latestFatigueReport
    );

    // Console output contains aggregate statistics
    // only, without provider names or answer records.

    console.log(
      "Fatigue report generated:",
      latestFatigueReport
    );

    console.table(
      latestFatigueReport.riskDistribution
    );

    console.table(
      latestFatigueReport.participation.daily
    );

    console.table(
      latestFatigueReport.factors.categories
    );

    console.table(
      latestFatigueReport.selfAssessment.distribution
    );

  } catch (error) {
    console.error(
      "Reporting failed:",
      error?.message || "Unknown error"
    );

    status.textContent =
      error?.message ||
      "Unable to generate report statistics.";

  } finally {
    reportingBusy = false;
    button.disabled = false;

    button.textContent =
      "Preview Report Statistics";
  }
}
