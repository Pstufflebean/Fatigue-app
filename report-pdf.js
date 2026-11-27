
// =====================================================
// ATLAS EMERGENCY SYSTEMS
// OPERATIONAL FATIGUE RISK REPORT
// OPTIMIZED PDF GENERATION MODULE
// =====================================================

(function () {
  "use strict";

  // ===================================================
  // REPORT CONFIGURATION
  // ===================================================

  const CONFIG = Object.freeze({
    company: "Atlas Emergency Systems",
    agency: "Linn County Ambulance District",
    agencyId: "LCAD",
    timeZone: "America/Chicago",
    margin: 16,
    chartHeight: 38,
    bodyFont: 10,
    noteFont: 9
  });

  const COLORS = Object.freeze({
    navy: "#173b62",
    dark: "#152d45",
    text: "#334155",
    muted: "#64748b",
    border: "#d5dce4",
    light: "#f1f5f9",
    white: "#ffffff",
    morning: "#3b82f6",
    overnight: "#25364e",
    green: "#229654",
    yellow: "#eab308",
    orange: "#ea580c",
    red: "#dc2626",
    unknown: "#94a3b8"
  });

  const RISK_COLORS = {
    GREEN: COLORS.green,
    YELLOW: COLORS.yellow,
    ORANGE: COLORS.orange,
    RED: COLORS.red,
    UNKNOWN: COLORS.unknown
  };

  // ===================================================
  // LOAD PDF LIBRARY
  // ===================================================

  let pdfLibraryPromise = null;

  function loadPDFLibrary() {

    if (window.jspdf?.jsPDF) {
      return Promise.resolve(window.jspdf.jsPDF);
    }

    if (pdfLibraryPromise) {
      return pdfLibraryPromise;
    }

    pdfLibraryPromise = new Promise(
      (resolve, reject) => {

        const script =
          document.createElement("script");

        script.src =
          "https://cdn.jsdelivr.net/npm/" +
          "jspdf@3.0.3/dist/jspdf.umd.min.js";

        script.onload = () => {
          if (window.jspdf?.jsPDF) {
            resolve(window.jspdf.jsPDF);
          } else {
            reject(
              new Error("PDF library unavailable.")
            );
          }
        };

        script.onerror = () => {
          script.remove();

          reject(
            new Error("Unable to load PDF library.")
          );
        };

        document.head.appendChild(script);

      }
    ).catch(error => {
      pdfLibraryPromise = null;
      throw error;
    });

    return pdfLibraryPromise;
  }

  // ===================================================
  // FORMATTING HELPERS
  // ===================================================

  function number(value) {

    if (
      value === null ||
      value === undefined ||
      value === "" ||
      !Number.isFinite(Number(value))
    ) {
      return "N/A";
    }

    return Number(value).toLocaleString(
      "en-US",
      {
        maximumFractionDigits: 2
      }
    );
  }

  function decimal(value) {

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(Number(value))
    ) {
      return "N/A";
    }

    return Number(value).toFixed(1);
  }

  function percent(value) {
    return value === null ||
      value === undefined
      ? "N/A"
      : decimal(value) + "%";
  }

  function dateLabel(value) {

    const date = new Date(
      value + "T12:00:00Z"
    );

    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "UTC",
        month: "long",
        day: "numeric",
        year: "numeric"
      }
    ).format(date);
  }

  function monthLabel(value) {

    const date = new Date(
      value + "-01T12:00:00Z"
    );

    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "UTC",
        month: "long",
        year: "numeric"
      }
    ).format(date);
  }

  function timestampLabel(value) {

    if (!value) {
      return "Not recorded";
    }

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      return "Invalid timestamp";
    }

    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: CONFIG.timeZone,
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }
    ).format(date) + " CT";
  }

  function safeText(value) {

    return String(value ?? "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2022/g, "-")
      .replace(/\u2265/g, ">=")
      .replace(/\u2264/g, "<=")
      .replace(/\u00a0/g, " ")
      .replace(/\u2026/g, "...")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\t/g, "    ");
  }

  // ===================================================
  // ADMINISTRATOR SESSION VERIFICATION
  // ===================================================

  async function verifyAdminSession() {

    const response = await fetch(
      "/api/admin-comments",
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "session"
        })
      }
    );

    if (!response.ok) {

      const error = new Error(
        response.status === 401
          ? "Administrator session expired."
          : "Administrator session could not be verified."
      );

      error.status = response.status;

      throw error;
    }

    const result = await response.json();

    if (result.authenticated !== true) {

      const error = new Error(
        "Administrator authentication required."
      );

      error.status = 401;

      throw error;
    }
  }

  // ===================================================
  // ADMINISTRATIVE REVIEW DATA
  // ===================================================

  async function buildAdministrativeReview(report) {

    if (
      typeof window.loadAdministrativeReportComments
        !== "function"
    ) {
      throw new Error(
        "Administrative comments module unavailable."
      );
    }

    const records =
      await loadReportingAssessments(report.range);

    const startTime =
      new Date(report.range.startUTC).getTime();

    const endTime =
      new Date(report.range.endUTC).getTime();

    const generatedTime =
      new Date(report.range.generatedAt).getTime();

    const redAssessments = records.filter(
      assessment => {

        const timestamp =
          new Date(assessment.created_at).getTime();

        return (
          timestamp >= startTime &&
          timestamp < endTime &&
          timestamp < generatedTime &&
          String(
            assessment.risk_color || ""
          ).toUpperCase() === "RED"
        );
      }
    );

    const expectedRedCount =
      report.riskDistribution.find(
        item => item.risk === "RED"
      )?.count || 0;

    if (
      redAssessments.length !== expectedRedCount
    ) {
      throw new Error(
        "Assessment records changed during report " +
        "generation. Please generate the report again."
      );
    }

    const reviews =
      await window.loadAdministrativeReportComments(
        redAssessments
      );

    if (
      !Array.isArray(reviews) ||
      reviews.length !== redAssessments.length
    ) {
      throw new Error(
        "Administrative review data incomplete."
      );
    }

    const expectedIds = new Set(
      redAssessments.map(item => item.id)
    );

    const returnedIds = new Set(
      reviews.map(item => item.assessment_id)
    );

    if (
      returnedIds.size !== expectedIds.size ||
      reviews.some(
        item => !expectedIds.has(item.assessment_id)
      )
    ) {
      throw new Error(
        "Administrative review records do not reconcile."
      );
    }

    const recordsById = new Map(
      redAssessments.map(
        item => [item.id, item]
      )
    );

    const normalizedReviews = reviews.map(
      item => {

        const assessment =
          recordsById.get(item.assessment_id);

        return {
          ...item,

          assessment_date:
            assessment.created_at,

          total_score:
            assessment.total_score === null ||
            assessment.total_score === undefined ||
            assessment.total_score === ""
              ? null
              : Number(assessment.total_score)
        };
      }
    );

    normalizedReviews.sort(
      (a, b) =>
        new Date(b.assessment_date).getTime() -
        new Date(a.assessment_date).getTime() ||
        String(a.assessment_id).localeCompare(
          String(b.assessment_id)
        )
    );

    const documented =
      normalizedReviews.filter(
        item =>
          typeof item.comment === "string" &&
          item.comment.trim().length > 0
      );

    const undocumented =
      normalizedReviews.filter(
        item =>
          typeof item.comment !== "string" ||
          item.comment.trim().length === 0
      );

    return {
      totalRed: redAssessments.length,

      withComments: documented.length,

      withoutComments: undocumented.length,

      documentationRate:
        redAssessments.length > 0

          ? documented.length /
            redAssessments.length * 100

          : null,

      comments: documented,

      undocumented
    };
  }

  // ===================================================
  // ENHANCED PARTICIPATION ANALYSIS
  // ===================================================
  // Preserves the existing reporting counts.
  // Adds completion status for morning windows.

  function enhanceParticipation(report) {

    const generatedTime =
      new Date(
        report.range.generatedAt
      ).getTime();

    const daily =
      report.participation.daily.map(
        day => {

          const morningEnd =
            new Date(
              reportLocalToUTC(day.date, 10)
            ).getTime();

          const morningStart =
            new Date(
              reportLocalToUTC(day.date, 7)
            ).getTime();

          const overnightStart =
            new Date(
              reportLocalToUTC(day.date, 22)
            ).getTime();

          return {
            ...day,

            morningComplete:
              morningEnd <= generatedTime,

            morningStarted:
              morningStart <= generatedTime,

            overnightStarted:
              overnightStart <= generatedTime
          };
        }
      );

    return {
      ...report.participation,

      daily,

      zeroMorningDays: daily.filter(
        day =>
          day.morningComplete &&
          day.morning === 0
      ).length,

      incompleteMorningDays: daily.filter(
        day => !day.morningComplete
      ).length
    };
  }

  // ===================================================
  // COMMON CHART SCALE
  // ===================================================

  function getChartScale(days) {

    let maximum = 0;

    for (const day of days) {

      maximum = Math.max(
        maximum,
        Number(day.morning) || 0,
        Number(day.overnight) || 0
      );
    }

    const targetStep =
      Math.max(1, maximum / 5);

    const magnitude = Math.pow(
      10,
      Math.floor(Math.log10(targetStep))
    );

    const steps = [
      1,
      2,
      5,
      10
    ].map(
      value => value * magnitude
    );

    const step = Math.max(
      1,
      steps.find(
        value => value >= targetStep
      ) || targetStep
    );

    const axisMaximum = Math.max(
      step,
      Math.ceil(maximum / step) * step
    );

    return {
      step,
      maximum: axisMaximum
    };
  }

  // ===================================================
  // PDF GENERATION
  // ===================================================

  async function downloadPDF(report) {

    const jsPDF =
      await loadPDFLibrary();

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
      compress: true
    });

    const pageWidth =
      doc.internal.pageSize.getWidth();

    const pageHeight =
      doc.internal.pageSize.getHeight();

    const margin = CONFIG.margin;

    const contentWidth =
      pageWidth - margin * 2;

    const bottom =
      pageHeight - 21;

    let y = 18;

    const review =
      report.administrativeReview;

    const participation =
      report.participation;

    doc.setProperties({
      title: "Operational Fatigue Risk Report",
      subject: "LCAD Fatigue Risk Analysis",
      author: CONFIG.company,
      creator: CONFIG.company
    });

    // =================================================
    // FONT AND PAGE HELPERS
    // =================================================

    function font(
      size = CONFIG.bodyFont,
      color = COLORS.text,
      weight = "normal"
    ) {

      doc.setFont("helvetica", weight);
      doc.setFontSize(size);
      doc.setTextColor(color);
    }

    function newPage() {

      doc.addPage();

      font(9, COLORS.navy, "bold");

      doc.text(
        CONFIG.company.toUpperCase(),
        margin,
        12
      );

      font(8, COLORS.muted);

      doc.text(
        CONFIG.agencyId +
        " | Operational Fatigue Risk Report",
        pageWidth - margin,
        12,
        {
          align: "right"
        }
      );

      doc.setDrawColor(COLORS.border);
      doc.setLineWidth(0.2);

      doc.line(
        margin,
        16,
        pageWidth - margin,
        16
      );

      y = 23;
    }

    function ensureSpace(height) {

      if (y + height > bottom) {
        newPage();
      }
    }

    function horizontalRule() {

      doc.setDrawColor(COLORS.border);
      doc.setLineWidth(0.2);

      doc.line(
        margin,
        y,
        pageWidth - margin,
        y
      );
    }

    function paragraph(
      text,
      size = CONFIG.bodyFont,
      color = COLORS.text,
      spacing = 2.5
    ) {

      font(size, color);

      const lines =
        doc.splitTextToSize(
          safeText(text),
          contentWidth
        );

      const lineHeight =
        size * 0.43;

      for (const line of lines) {

        ensureSpace(lineHeight + 2);

        font(size, color);

        doc.text(
          line,
          margin,
          y
        );

        y += lineHeight;
      }

      y += spacing;
    }

    function note(text) {

      paragraph(
        text,
        CONFIG.noteFont,
        COLORS.muted,
        3
      );
    }

    // Reserve space for both a section heading
    // and the beginning of its content.

    function section(
      title,
      minimumContentHeight = 20
    ) {

      font(13, COLORS.navy, "bold");

      const lines =
        doc.splitTextToSize(
          safeText(title),
          contentWidth
        );

      ensureSpace(
        lines.length * 5.5 +
        12 +
        minimumContentHeight
      );

      y += 3;

      font(13, COLORS.navy, "bold");

      for (const line of lines) {

        doc.text(
          line,
          margin,
          y
        );

        y += 5.5;
      }

      horizontalRule();

      y += 6;
    }

    function smallHeading(
      title,
      minimumContentHeight = 8
    ) {

      font(10, COLORS.navy, "bold");

      const lines =
        doc.splitTextToSize(
          safeText(title),
          contentWidth
        );

      ensureSpace(
        lines.length * 4.5 +
        minimumContentHeight +
        2
      );

      font(10, COLORS.navy, "bold");

      for (const line of lines) {

        doc.text(line, margin, y);

        y += 4.5;
      }

      y += 1;
    }

    // =================================================
    // COMPACT TABLE ROWS
    // =================================================

    function tableRow(
      label,
      value,
      options = {}
    ) {

      font(9, COLORS.text);

      const valueWidth =
        options.valueWidth || 35;

      const lines =
        doc.splitTextToSize(
          safeText(label),
          contentWidth -
          valueWidth -
          5
        );

      const height =
        Math.max(
          7,
          lines.length * 4 + 3
        );

      ensureSpace(height);

      font(9, COLORS.text);

      lines.forEach(
        (line, index) => {

          doc.text(
            line,
            margin,
            y + index * 4
          );
        }
      );

      font(
        9,
        options.color || COLORS.navy,
        "bold"
      );

      doc.text(
        safeText(value),
        pageWidth - margin,
        y,
        {
          align: "right"
        }
      );

      y += height - 3;

      horizontalRule();

      y += 3;
    }

    // =================================================
    // COMPACT KPI CARD ROW
    // ===================================================

    function metricRow(metrics) {

      const gap = 3;

      const width =
        (
          contentWidth -
          gap * (metrics.length - 1)
        ) / metrics.length;

      const cardHeight = 27;

      ensureSpace(cardHeight + 4);

      metrics.forEach(
        (metric, index) => {

          const x =
            margin +
            index * (width + gap);

          doc.setFillColor(COLORS.light);

          doc.roundedRect(
            x,
            y,
            width,
            cardHeight,
            1.5,
            1.5,
            "F"
          );

          font(8.5, COLORS.muted);

          const labels =
            doc.splitTextToSize(
              safeText(metric.label),
              width - 7
            );

          labels.forEach(
            (label, labelIndex) => {

              doc.text(
                label,
                x + 3.5,
                y + 5 +
                labelIndex * 3.5
              );
            }
          );

          font(
            19,
            metric.color || COLORS.navy,
            "bold"
          );

          doc.text(
            safeText(metric.value),
            x + 3.5,
            y + 18
          );

          if (metric.subtitle) {

            font(7.5, COLORS.muted);

            doc.text(
              safeText(metric.subtitle),
              x + 3.5,
              y + 23.5
            );
          }
        }
      );

      y += cardHeight + 4;
    }

    // =================================================
    // HORIZONTAL BAR CHART
    // =================================================

    function horizontalBar(
      label,
      value,
      percentageValue,
      color
    ) {

      ensureSpace(13);

      font(9, COLORS.text);

      doc.text(
        safeText(label),
        margin,
        y
      );

      font(9, COLORS.navy, "bold");

      doc.text(
        safeText(value),
        pageWidth - margin,
        y,
        {
          align: "right"
        }
      );

      y += 2.5;

      doc.setFillColor(COLORS.light);

      doc.roundedRect(
        margin,
        y,
        contentWidth,
        4,
        0.8,
        0.8,
        "F"
      );

      const width =
        contentWidth *
        Math.min(
          100,
          Math.max(
            0,
            Number(percentageValue) || 0
          )
        ) / 100;

      if (width > 0) {

        doc.setFillColor(color);

        doc.rect(
          margin,
          y,
          width,
          4,
          "F"
        );
      }

      y += 9;
    }

    // =================================================
    // REPORT HEADER
    // =================================================

    doc.setFillColor(COLORS.navy);

    doc.rect(
      0,
      0,
      pageWidth,
      4,
      "F"
    );

    font(9, COLORS.navy, "bold");

    doc.text(
      CONFIG.company.toUpperCase(),
      margin,
      y
    );

    y += 10;

    font(21, COLORS.dark, "bold");

    const titleLines =
      doc.splitTextToSize(
        "Operational Fatigue Risk Report",
        contentWidth
      );

    titleLines.forEach(
      line => {

        doc.text(line, margin, y);

        y += 8;
      }
    );

    font(12, COLORS.text);

    doc.text(
      report.agencyName || CONFIG.agency,
      margin,
      y
    );

    y += 6;

    paragraph(
      "Reporting period: " +
      dateLabel(report.range.startDate) +
      " through " +
      dateLabel(report.range.endDate),
      10,
      COLORS.muted,
      1
    );

    paragraph(
      "Generated: " +
      timestampLabel(
        report.range.generatedAt
      ),
      9,
      COLORS.muted,
      3
    );

    // =================================================
    // SECTION 1
    // EXECUTIVE SUMMARY AND KEY METRICS
    // =================================================

    section(
      "01 - Executive Summary and Key Metrics",
      64
    );

    metricRow([
      {
        label: "Total Assessments",
        value: number(
          report.summary.totalAssessments
        )
      },
      {
        label: "Average Fatigue Score",
        value: decimal(
          report.summary.averageScore
        )
      }
    ]);

    metricRow([
      {
        label: "High Risk",
        value: number(
          report.summary.highRisk
        ),
        subtitle: "Scores greater than 12",
        color: COLORS.red
      },
      {
        label: "Peer-Support Requests",
        value: number(
          report.summary.peerSupportRequests
        )
      }
    ]);

    const redCount =
      review.totalRed;

    const orangeCount =
      report.riskDistribution.find(
        item => item.risk === "ORANGE"
      )?.count || 0;

    const elevatedCount =
      redCount + orangeCount;

    const total =
      report.summary.totalAssessments;

    if (total > 0) {

      const elevatedPercentage =
        elevatedCount / total * 100;

      paragraph(
        `${number(total)} assessments were recorded ` +
        "during the selected reporting period. " +
        `${number(elevatedCount)} (` +
        `${percent(elevatedPercentage)}) were ` +
        "classified as ORANGE or RED. " +
        `${number(redCount)} were RED, and ` +
        `${number(report.summary.highRisk)} ` +
        "exceeded the High Risk reporting threshold."
      );

    } else {

      paragraph(
        "No assessments were recorded during " +
        "the selected calendar reporting period."
      );
    }

    // =================================================
    // SECTION 2
    // FATIGUE RISK DISTRIBUTION
    // =================================================

    section(
      "02 - Fatigue Risk Distribution",
      48
    );

    for (
      const risk of report.riskDistribution
    ) {

      if (
        risk.risk === "UNKNOWN" &&
        risk.count === 0
      ) {
        continue;
      }

      horizontalBar(
        risk.risk,

        number(risk.count) +
        " (" +
        (
          total > 0
            ? percent(risk.percentage)
            : "N/A"
        ) +
        ")",

        risk.percentage,

        RISK_COLORS[risk.risk] ||
        COLORS.unknown
      );
    }

    note(
      "Risk classification: GREEN <4; " +
      "YELLOW 4 to <7; ORANGE 7 to <10; " +
      "RED >=10. High Risk (>12) is a separate " +
      "reporting measure and does not change " +
      "existing alert thresholds."
    );

    // =================================================
    // SECTION 3
    // DAILY ASSESSMENT PARTICIPATION
    // =================================================

    section(
      "03 - Daily Assessment Participation",
      35
    );

    metricRow([
      {
        label: "Morning Assessments",
        value: number(
          participation.totalMorning
        ),
        subtitle: "0700-0959",
        color: COLORS.morning
      },
      {
        label: "Overnight Assessments",
        value: number(
          participation.totalOvernight
        ),
        subtitle: "2200-0559",
        color: COLORS.overnight
      }
    ]);

    paragraph(
      "Morning assessments are assigned to their " +
      "calendar date. Overnight assessments " +
      "completed after midnight are assigned to " +
      "the preceding operational night."
    );

    note(
      "All times use Central Time. Monthly charts " +
      "use a common vertical scale for direct " +
      "comparison. Incomplete assessment windows " +
      "are identified beneath each chart."
    );

    // =================================================
    // GROUP DAILY DATA BY MONTH
    // =================================================

    const months = new Map();

    for (const day of participation.daily) {

      const key =
        day.date.slice(0, 7);

      if (!months.has(key)) {
        months.set(key, []);
      }

      months.get(key).push(day);
    }

    const scale =
      getChartScale(
        participation.daily
      );

    // =================================================
    // OPTIMIZED DAILY PAIRED-COLUMN CHART
    // =================================================

    function dailyChart(month, days) {

      const morningTotal =
        days.reduce(
          (sum, day) =>
            sum + day.morning,
          0
        );

      const overnightTotal =
        days.reduce(
          (sum, day) =>
            sum + day.overnight,
          0
        );

      const incompleteMorning =
        days.filter(
          day => !day.morningComplete
        );

      const incompleteNight =
        days.filter(
          day => !day.overnightComplete
        );

      const allZero =
        morningTotal === 0 &&
        overnightTotal === 0;

      // Keep empty partial-month periods compact.
      // Show the dates explicitly rather than
      // allocating a full empty chart.

      if (
        allZero &&
        days.length <= 7
      ) {

        ensureSpace(35);

        smallHeading(
          monthLabel(month)
        );

        const firstDay =
          Number(
            days[0].date.slice(8, 10)
          );

        const lastDay =
          Number(
            days[days.length - 1]
              .date.slice(8, 10)
          );

        tableRow(
          "Days included: " +
          firstDay +
          (
            firstDay === lastDay
              ? ""
              : "-" + lastDay
          ),
          "0 / 0"
        );

        note(
          "No morning or overnight assessments " +
          "were recorded during these dates." +
          (
            incompleteMorning.length ||
            incompleteNight.length

              ? " One or more assessment windows " +
                "were not complete at generation."

              : ""
          )
        );

        return;
      }

      // Keep the chart and its legend together.
      // Multiple charts can share the same page.

      const chartSpace =
        79 +
        (
          incompleteMorning.length
            ? 6
            : 0
        ) +
        (
          incompleteNight.length
            ? 6
            : 0
        );

      ensureSpace(chartSpace);

      smallHeading(
        monthLabel(month)
      );

      const chartX =
        margin + 12;

      const chartY =
        y + 9;

      const chartW =
        contentWidth - 15;

      const chartH =
        CONFIG.chartHeight;

      const chartBottom =
        chartY + chartH;

      const groupWidth =
        chartW / days.length;

      const barWidth =
        Math.min(
          groupWidth * 0.33,
          5
        );

      // ===============================================
      // CHART LEGEND
      // ===============================================

      doc.setFillColor(
        COLORS.morning
      );

      doc.rect(
        margin,
        y,
        3,
        3,
        "F"
      );

      font(8.5, COLORS.text);

      doc.text(
        "Morning",
        margin + 5,
        y + 2.7
      );

      doc.setFillColor(
        COLORS.overnight
      );

      doc.rect(
        margin + 35,
        y,
        3,
        3,
        "F"
      );

      doc.text(
        "Operational night",
        margin + 40,
        y + 2.7
      );

      // ===============================================
      // VERTICAL SCALE
      // ===============================================

      for (
        let tick = 0;
        tick <= scale.maximum;
        tick += scale.step
      ) {

        const tickY =
          chartBottom -
          tick / scale.maximum *
          chartH;

        doc.setDrawColor(
          COLORS.border
        );

        doc.setLineWidth(0.15);

        doc.line(
          chartX,
          tickY,
          chartX + chartW,
          tickY
        );

        font(8, COLORS.muted);

        doc.text(
          number(tick),
          chartX - 2,
          tickY + 1,
          {
            align: "right"
          }
        );
      }

      // ===============================================
      // DAILY COLUMNS
      // ===============================================

      days.forEach(
        (day, index) => {

          const center =
            chartX +
            groupWidth *
            (index + 0.5);

          const morningHeight =
            day.morning /
            scale.maximum *
            chartH;

          const overnightHeight =
            day.overnight /
            scale.maximum *
            chartH;

          if (morningHeight > 0) {

            doc.setFillColor(
              COLORS.morning
            );

            doc.rect(
              center - barWidth - 0.2,
              chartBottom - morningHeight,
              barWidth,
              morningHeight,
              "F"
            );
          }

          if (overnightHeight > 0) {

            doc.setFillColor(
              COLORS.overnight
            );

            doc.rect(
              center + 0.2,
              chartBottom - overnightHeight,
              barWidth,
              overnightHeight,
              "F"
            );
          }

          let marker = "";

          if (
            !day.morningComplete ||
            !day.overnightComplete
          ) {
            marker = "*";
          }

          font(7, COLORS.text);

          doc.text(
            String(
              Number(
                day.date.slice(8, 10)
              )
            ) + marker,

            center,

            chartBottom + 4,

            {
              align: "center"
            }
          );
        }
      );

      font(8, COLORS.muted);

      doc.text(
        "Day of month",
        chartX + chartW / 2,
        chartBottom + 9,
        {
          align: "center"
        }
      );

      y = chartBottom + 14;

      paragraph(
        "Morning: " +
        number(morningTotal) +
        " | Operational night: " +
        number(overnightTotal),
        9,
        COLORS.text,
        1
      );

      // ===============================================
      // INCOMPLETE ASSESSMENT WINDOWS
      // ===============================================

      if (incompleteMorning.length > 0) {

        const dates =
          incompleteMorning.map(
            day =>
              Number(
                day.date.slice(8, 10)
              )
          ).join(", ");

        const notStarted =
          incompleteMorning.every(
            day => !day.morningStarted
          );

        paragraph(
          "* Morning window " +
          (
            notStarted
              ? "not yet started"
              : "incomplete"
          ) +
          " on day(s): " +
          dates + ".",
          9,
          COLORS.muted,
          1
        );
      }

      if (incompleteNight.length > 0) {

        const dates =
          incompleteNight.map(
            day =>
              Number(
                day.date.slice(8, 10)
              )
          ).join(", ");

        const notStarted =
          incompleteNight.every(
            day => !day.overnightStarted
          );

        paragraph(
          "* Operational night " +
          (
            notStarted
              ? "not yet started"
              : "incomplete"
          ) +
          " on day(s): " +
          dates + ".",
          9,
          COLORS.muted,
          1
        );
      }

      y += 4;
    }

    // =================================================
    // RENDER MONTHLY CHARTS
    // =================================================

    for (
      const [month, days] of months
    ) {
      dailyChart(month, days);
    }

    smallHeading(
      "Assessment Participation Summary",
      28
    );

    tableRow(
      "Completed morning windows without assessments",
      number(
        participation.zeroMorningDays
      )
    );

    tableRow(
      "Completed operational nights without assessments",
      number(
        participation.zeroOvernightDays
      )
    );

    tableRow(
      "Incomplete morning windows",
      number(
        participation.incompleteMorningDays
      )
    );

    tableRow(
      "Incomplete operational nights",
      number(
        participation.incompleteOvernightDays
      )
    );

    note(
      "The participation analysis includes next-day " +
      "assessments belonging to the final operational " +
      "night. Other report statistics use actual " +
      "calendar completion dates. Assessment counts " +
      "do not independently establish participation " +
      "or compliance rates without staffing and " +
      "assessment requirement information."
    );

    // =================================================
    // SECTION 4
    // CONTRIBUTING FATIGUE FACTORS
    // =================================================

    section(
      "04 - Contributing Fatigue Factors",
      30
    );

    paragraph(
      "Distribution of attributable fatigue scoring " +
      "points across established assessment categories."
    );

    for (
      const factor of report.factors.categories
    ) {

      horizontalBar(
        factor.title,

        number(factor.points) +
        " pts (" +
        (
          report.factors.totalAttributedPoints > 0
            ? percent(factor.percentage)
            : "N/A"
        ) +
        ")",

        factor.percentage,

        "#345b80"
      );
    }

    tableRow(
      "Total attributable fatigue points",
      number(
        report.factors.totalAttributedPoints
      )
    );

    note(
      "Historical weighted scores are preserved. " +
      "Circadian contributions are inferred when " +
      "score differences are consistent with " +
      "established scoring rules. These percentages " +
      "describe scoring contributions, not proven " +
      "causes of fatigue."
    );

    // =================================================
    // SECTION 5
    // PROVIDER SELF-ASSESSMENT
    // =================================================

    section(
      "05 - Provider Self-Assessment Trends",
      48
    );

    const selfColors = [
      COLORS.green,
      COLORS.yellow,
      COLORS.orange,
      COLORS.red
    ];

    for (
      const item of
      report.selfAssessment.distribution
    ) {

      horizontalBar(
        item.label,

        number(item.count) +
        " (" +
        (
          report.selfAssessment.totalResponses > 0
            ? percent(item.percentage)
            : "N/A"
        ) +
        ")",

        item.percentage,

        selfColors[item.value] ||
        COLORS.unknown
      );
    }

    tableRow(
      "Valid self-assessment responses",
      number(
        report.selfAssessment.totalResponses
      )
    );

    tableRow(
      "Good to go with ORANGE or RED risk",
      number(
        report.selfAssessment.goodToGoElevatedRisk
      )
    );

    tableRow(
      "Good to go with score greater than 12",
      number(
        report.selfAssessment.goodToGoHighRisk
      )
    );

    // Show the percentage of "Good to go"
    // submissions that were ORANGE or RED.

    const goodToGoCount =
      report.selfAssessment.distribution.find(
        item => item.value === 0
      )?.count || 0;

    if (goodToGoCount > 0) {

      const mismatchPercentage =
        report.selfAssessment.goodToGoElevatedRisk /
        goodToGoCount * 100;

      tableRow(
        "Good to go submissions classified ORANGE or RED",
        percent(mismatchPercentage)
      );
    }

    note(
      "Response percentages use valid self-assessment " +
      "responses. Differences between perceived " +
      "readiness and calculated fatigue risk may " +
      "identify opportunities for education and review."
    );

    // =================================================
    // SECTION 6
    // ADMINISTRATIVE RECOMMENDATIONS
    // =================================================

    section(
      "06 - Administrative Recommendations",
      25
    );

    function recommendation(
      title,
      text
    ) {

      font(
        CONFIG.bodyFont,
        COLORS.text
      );

      const lines =
        doc.splitTextToSize(
          safeText(text),
          contentWidth
        );

      const needed =
        lines.length * 4.3 + 14;

      ensureSpace(
        Math.min(needed, 60)
      );

      smallHeading(
        title,
        10
      );

      paragraph(text);

      y += 1;
    }

    for (
      const item of report.recommendations
    ) {

      recommendation(
        item.title,
        item.text
      );
    }

    if (
      participation.zeroMorningDays > 0 &&
      total > 0
    ) {

      recommendation(
        "Morning assessment participation",

        `${number(participation.zeroMorningDays)} ` +
        "completed morning assessment windows " +
        "recorded no assessments. Compare these " +
        "dates with staffing, operational activity, " +
        "and assessment requirements before " +
        "determining whether compliance concerns exist."
      );
    }

    if (review.withoutComments > 0) {

      recommendation(
        "RED assessment documentation",

        `${number(review.withoutComments)} RED ` +
        "assessments do not currently contain an " +
        "administrative comment. Review these records " +
        "and document applicable supervisory actions " +
        "or fatigue mitigation measures."
      );
    }

    note(
      "Recommendations are generated using predefined " +
      "analytical rules. They support administrative " +
      "review and do not independently determine " +
      "provider fitness for duty."
    );

    // =================================================
    // SECTION 7
    // RED ASSESSMENT REVIEW
    // =================================================

    section(
      "07 - RED Assessment Review and Administrative Comments",
      64
    );

    metricRow([
      {
        label: "Total RED Assessments",
        value: number(review.totalRed),
        color: COLORS.red
      },
      {
        label: "With Administrative Comments",
        value: number(review.withComments),
        color: COLORS.green
      }
    ]);

    metricRow([
      {
        label: "Without Administrative Comments",
        value: number(review.withoutComments)
      },
      {
        label: "Documentation Rate",
        value: percent(
          review.documentationRate
        )
      }
    ]);

    if (
      review.documentationRate !== null
    ) {

      horizontalBar(
        "Administrative documentation rate",

        percent(
          review.documentationRate
        ),

        review.documentationRate,

        "#345b80"
      );
    }

    note(
      "Documentation rates reflect the presence of " +
      "saved administrative comments. They do not " +
      "independently establish whether all required " +
      "fatigue mitigation measures were completed."
    );

    note(
      "Comments are associated with the original " +
      "assessment completion date. Reports include " +
      "the latest saved comment version available " +
      "when comments are retrieved."
    );

    if (review.totalRed === 0) {

      paragraph(
        "No RED assessments were recorded during " +
        "the selected reporting period."
      );

    } else if (
      review.withComments === 0
    ) {

      paragraph(
        "No administrative comments are currently " +
        "recorded for the RED assessments within " +
        "this reporting period."
      );
    }

    // =================================================
    // RENDER SAVED ADMINISTRATIVE COMMENTS
    // =================================================

    function renderAdministrativeComment(
      item,
      index
    ) {

      const label =
        "RED Assessment " +
        String(index + 1);

      const score =
        number(item.total_score);

      function commentHeader(
        continued = false
      ) {

        doc.setFillColor(
          COLORS.light
        );

        doc.roundedRect(
          margin,
          y,
          contentWidth,
          14,
          1.2,
          1.2,
          "F"
        );

        font(10, COLORS.navy, "bold");

        doc.text(
          label +
          (
            continued
              ? " (continued)"
              : ""
          ),

          margin + 3,

          y + 5
        );

        font(10, COLORS.red, "bold");

        doc.text(
          "RED | Score: " + score,

          pageWidth - margin - 3,

          y + 5,

          {
            align: "right"
          }
        );

        font(9, COLORS.muted);

        doc.text(
          "Assessment: " +
          timestampLabel(
            item.assessment_date
          ),

          margin + 3,

          y + 10.5
        );

        y += 19;
      }

      font(
        CONFIG.bodyFont,
        COLORS.text
      );

      const lines =
        doc.splitTextToSize(
          safeText(item.comment),
          contentWidth - 7
        );

      const lineHeight = 4.5;

      const wasEdited =
        item.comment_updated_at &&
        item.comment_updated_at !==
          item.comment_created_at;

      const estimatedHeight =
        38 +
        lines.length * lineHeight +
        (
          wasEdited
            ? 6
            : 0
        );

      // Keep a complete comment together when
      // it can fit on a single page.

      const availablePageHeight =
        bottom - 23;

      if (
        estimatedHeight <=
        availablePageHeight
      ) {

        ensureSpace(
          estimatedHeight
        );

      } else {

        ensureSpace(42);
      }

      commentHeader();

      font(9, COLORS.navy, "bold");

      doc.text(
        "Administrative Comment",
        margin + 3,
        y
      );

      y += 5;

      for (const line of lines) {

        if (
          y + lineHeight + 2 > bottom
        ) {

          newPage();

          commentHeader(true);
        }

        doc.setDrawColor(
          COLORS.navy
        );

        doc.setLineWidth(0.45);

        doc.line(
          margin,
          y - 3,
          margin,
          y + 1.5
        );

        font(
          CONFIG.bodyFont,
          COLORS.text
        );

        doc.text(
          line,
          margin + 3.5,
          y
        );

        y += lineHeight;
      }

      y += 3;

      const metadataHeight =
        wasEdited ? 15 : 9;

      if (
        y + metadataHeight > bottom
      ) {

        newPage();

        commentHeader(true);
      }

      paragraph(
        "Comment created: " +
        timestampLabel(
          item.comment_created_at
        ),

        9,
        COLORS.muted,
        1
      );

      if (wasEdited) {

        paragraph(
          "Last updated: " +
          timestampLabel(
            item.comment_updated_at
          ),

          9,
          COLORS.muted,
          1
        );
      }

      y += 2;

      if (y + 3 <= bottom) {
        horizontalRule();
      }

      y += 6;
    }

    if (review.comments.length > 0) {

      smallHeading(
        "Documented Administrative Actions",
        45
      );

      review.comments.forEach(
        (item, index) => {

          renderAdministrativeComment(
            item,
            index
          );
        }
      );
    }

    // =================================================
    // RED ASSESSMENTS WITHOUT COMMENTS
    // =================================================
    // A compact two-column follow-up list.
    // No provider names or original answer values
    // are included.

    function renderUndocumentedAssessments() {

      const records =
        review.undocumented;

      if (!records.length) {
        return;
      }

      smallHeading(
        "RED Assessments Awaiting Documentation",
        28
      );

      paragraph(
        "The following RED assessments do not " +
        "currently have a saved administrative " +
        "comment. Absence of documentation does " +
        "not establish that an intervention was " +
        "not performed.",

        9,
        COLORS.muted
      );

      const gap = 5;

      const columnWidth =
        (contentWidth - gap) / 2;

      const rowHeight = 8;

      function listHeader(
        continued = false
      ) {

        ensureSpace(
          continued ? 19 : 12
        );

        if (continued) {

          smallHeading(
            "RED Assessments Awaiting Documentation (continued)",
            12
          );
        }

        doc.setFillColor(
          COLORS.light
        );

        doc.rect(
          margin,
          y,
          contentWidth,
          7,
          "F"
        );

        font(
          8,
          COLORS.navy,
          "bold"
        );

        for (
          let column = 0;
          column < 2;
          column++
        ) {

          const x =
            margin +
            column *
            (columnWidth + gap);

          doc.text(
            "Assessment Date / Time",
            x + 2,
            y + 4.5
          );

          doc.text(
            "Score",
            x + columnWidth - 2,
            y + 4.5,
            {
              align: "right"
            }
          );
        }

        y += 11;
      }

      listHeader();

      for (
        let index = 0;
        index < records.length;
        index += 2
      ) {

        if (
          y + rowHeight > bottom
        ) {

          newPage();

          listHeader(true);
        }

        for (
          let column = 0;
          column < 2;
          column++
        ) {

          const item =
            records[index + column];

          if (!item) {
            continue;
          }

          const x =
            margin +
            column *
            (columnWidth + gap);

          font(
            8.5,
            COLORS.text
          );

          doc.text(
            timestampLabel(
              item.assessment_date
            ),

            x + 2,

            y
          );

          font(
            9,
            COLORS.red,
            "bold"
          );

          doc.text(
            number(
              item.total_score
            ),

            x + columnWidth - 2,

            y,

            {
              align: "right"
            }
          );

          doc.setDrawColor(
            COLORS.border
          );

          doc.setLineWidth(0.15);

          doc.line(
            x,
            y + 2.5,
            x + columnWidth,
            y + 2.5
          );
        }

        y += rowHeight;
      }

      y += 3;
    }

    renderUndocumentedAssessments();

    note(
      "Administrative comments are reproduced from " +
      "saved administrator entries. Review comments " +
      "for sensitive information before distributing " +
      "this report."
    );

    // =================================================
    // REPORTING METHODOLOGY AND DATA QUALITY
    // =================================================

    section(
      "Reporting Methodology and Data Quality",
      25
    );

    const qualityRows = [
      [
        "Missing or invalid assessment scores",
        report.summary.missingScoreCount
      ],
      [
        "Missing peer-support responses",
        report.summary.peerSupportMissing
      ],
      [
        "Missing self-assessment responses",
        report.selfAssessment.missingResponses
      ],
      [
        "Assessments with no scoring answers",
        report.factors.missingAnswerAssessments
      ],
      [
        "Invalid scoring records",
        report.factors.invalidScoreAssessments
      ],
      [
        "Unreconciled assessment scores",
        report.factors.discrepantAssessments
      ],
      [
        "Assessments with inferred circadian points",
        report.factors.inferredCircadianAssessments
      ],
      [
        "Unknown risk classifications",
        report.riskDistribution.find(
          item => item.risk === "UNKNOWN"
        )?.count || 0
      ]
    ];

    for (
      const [label, value] of qualityRows
    ) {

      tableRow(
        label,

        number(value),

        {
          color:
            Number(value) > 0 &&
            !label.includes("inferred circadian")

              ? COLORS.orange

              : COLORS.navy
        }
      );
    }

    note(
      "Reports count assessment submissions, not " +
      "unique providers. Assessment counts alone " +
      "do not establish compliance rates, staffing " +
      "exposure, or fatigue prevalence among " +
      "individual employees."
    );

    note(
      "Provider-name response fields are excluded " +
      "from report analytics. Administrative comments " +
      "are included as entered and are not automatically " +
      "de-identified."
    );

    note(
      "Administrative comments are retained as " +
      "agency-specific records and are not copied " +
      "into the global assessment database."
    );

    note(
      "Controlled test assessments, if present in " +
      "the database, are included in these statistics. " +
      "Verify the reporting dataset before using this " +
      "report for formal administrative purposes."
    );

    // =================================================
    // PAGE FOOTERS
    // =================================================

    const totalPages =
      doc.internal.getNumberOfPages();

    for (
      let page = 1;
      page <= totalPages;
      page++
    ) {

      doc.setPage(page);

      doc.setDrawColor(
        COLORS.border
      );

      doc.setLineWidth(0.2);

      doc.line(
        margin,
        pageHeight - 16,
        pageWidth - margin,
        pageHeight - 16
      );

      font(7.5, COLORS.muted);

      doc.text(
        "CONFIDENTIAL - ADMINISTRATIVE USE ONLY",
        margin,
        pageHeight - 11
      );

      doc.text(
        `Page ${page} of ${totalPages}`,

        pageWidth - margin,

        pageHeight - 11,

        {
          align: "right"
        }
      );

      doc.text(
        CONFIG.company +
        " | " +
        CONFIG.agencyId,

        margin,

        pageHeight - 7
      );
    }

    // =================================================
    // SAVE PDF
    // =================================================

    const filename =
      CONFIG.agencyId +
      "_Fatigue_Report_" +
      report.range.startDate +
      "_to_" +
      report.range.endDate +
      ".pdf";

    doc.save(filename);
  }

  // ===================================================
  // ADMINISTRATIVE REVIEW PREVIEW
  // ===================================================

  function renderAdministrativeReviewPreview(
    report
  ) {

    const status =
      document.getElementById(
        "reportingStatus"
      );

    const review =
      report.administrativeReview;

    const panel =
      document.createElement("div");

    panel.style.cssText = `
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 18px;
      margin-top: 15px;
      color: #173b62;
      line-height: 1.7;
    `;

    function heading(text) {

      const element =
        document.createElement("h3");

      element.textContent = text;

      element.style.cssText = `
        color: #173b62;
        font-size: 16px;
        margin: 0 0 12px;
      `;

      panel.appendChild(element);
    }

    function row(label, value) {

      const element =
        document.createElement("div");

      element.style.cssText = `
        display: flex;
        justify-content: space-between;
        gap: 15px;
        padding: 7px 0;
        border-bottom: 1px solid #e2e8f0;
        font-size: 14px;
        color: #334155;
      `;

      const name =
        document.createElement("span");

      name.textContent = label;

      const amount =
        document.createElement("strong");

      amount.textContent =
        String(value);

      element.append(
        name,
        amount
      );

      panel.appendChild(element);
    }

    heading(
      "7. RED Assessment Review and Administrative Comments"
    );

    row(
      "Total RED Assessments",
      review.totalRed
    );

    row(
      "With Administrative Comments",
      review.withComments
    );

    row(
      "Without Administrative Comments",
      review.withoutComments
    );

    row(
      "Documentation Rate",
      percent(review.documentationRate)
    );

    row(
      "Completed Morning Windows Without Assessments",
      report.participation.zeroMorningDays
    );

    row(
      "Incomplete Morning Windows",
      report.participation.incompleteMorningDays
    );

    const note =
      document.createElement("p");

    note.textContent =
      "Saved comments and the list of RED assessments " +
      "awaiting documentation are included in the PDF. " +
      "Review the report for sensitive information " +
      "before distribution.";

    note.style.cssText = `
      font-size: 12px;
      color: #64748b;
      margin: 12px 0 0;
    `;

    panel.appendChild(note);

    status.appendChild(panel);
  }

  // ===================================================
  // UPDATE REPORTING CONTENTS LIST
  // ===================================================

  function updateReportContents() {

    const list =
      document.querySelector(
        ".reporting-section-list"
      );

    if (!list) {
      return;
    }

    const exists =
      Array.from(list.children).some(
        item =>
          item.textContent
            .toLowerCase()
            .includes(
              "red assessment review"
            )
      );

    if (!exists) {

      const item =
        document.createElement("li");

      item.textContent =
        "RED Assessment Review and Administrative Comments";

      list.appendChild(item);
    }
  }

  // ===================================================
  // CONNECT REPORTING INTERFACE
  // ===================================================

  const originalInitialize =
    initializeReporting;

  initializeReporting = function () {

    originalInitialize();

    updateReportContents();

    const button =
      document.getElementById(
        "generateReportButton"
      );

    if (!reportingBusy) {

      button.textContent =
        "Generate PDF Report";
    }

    if (!latestFatigueReport) {

      document.getElementById(
        "reportingStatus"
      ).textContent =
        "Select a reporting period to generate " +
        "your Operational Fatigue Risk Report.";
    }
  };

  // ===================================================
  // GENERATE COMPLETE REPORT
  // ===================================================

  generateFatigueReport =
    async function () {

      if (
        reportingBusy ||
        !reportingAdminVisible() ||
        getComputedStyle(
          document.getElementById(
            "reportingView"
          )
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
        document.getElementById(
          "reportingStatus"
        );

      button.disabled = true;

      button.textContent =
        "Generating PDF...";

      status.textContent =
        "Verifying administrator session...";

      try {

        // Verify authentication even if the
        // selected period contains no RED records.

        await verifyAdminSession();

        status.textContent =
          "Retrieving assessment records and " +
          "calculating report statistics...";

        const report =
          await buildFatigueReport();

        // Add morning-window completion analysis
        // without changing the existing statistics.

        report.participation =
          enhanceParticipation(report);

        status.textContent =
          "Retrieving administrative comments...";

        report.administrativeReview =
          await buildAdministrativeReview(report);

        status.textContent =
          "Formatting optimized PDF report...";

        await downloadPDF(report);

        // Keep aggregate statistics only.
        // Do not retain comments or individual
        // follow-up records in global report state.

        latestFatigueReport = {
          ...report,

          administrativeReview: {
            ...report.administrativeReview,

            comments: [],

            undocumented: []
          }
        };

        renderReportingPreview(
          latestFatigueReport
        );

        renderAdministrativeReviewPreview(
          latestFatigueReport
        );

        const confirmation =
          document.createElement("p");

        confirmation.textContent =
          "PDF report generated successfully. " +
          "Check your browser downloads.";

        confirmation.style.cssText = `
          color: #15803d;
          font-weight: 700;
          margin: 12px 0;
        `;

        status.prepend(confirmation);

        for (
          const paragraph of
          status.querySelectorAll("p")
        ) {

          if (
            paragraph.textContent.includes(
              "PDF generation will be added"
            )
          ) {

            paragraph.textContent =
              "These statistics are included in " +
              "the generated PDF report. " +
              "Provider-name response fields " +
              "are excluded from report analytics.";
          }
        }

      } catch (error) {

        // Do not log administrative comment text.

        console.error(
          "PDF report generation failed."
        );

        latestFatigueReport = null;

        status.textContent =
          error?.status === 401

            ? "Your administrator session has expired. " +
              "Refresh the page and sign in again."

            : error?.message ||
              "Unable to generate PDF report.";

      } finally {

        reportingBusy = false;

        button.disabled = false;

        button.textContent =
          "Generate PDF Report";
      }
    };

})();
