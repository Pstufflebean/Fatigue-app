
// =====================================================
// ATLAS EMERGENCY SYSTEMS
// FATIGUE PDF REPORT GENERATOR
// =====================================================

(function () {
  "use strict";

  const COLORS = {
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
  };

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
      return Promise.resolve(
        window.jspdf.jsPDF
      );
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
              new Error(
                "PDF library unavailable."
              )
            );
          }
        };

        script.onerror = () => {
          reject(
            new Error(
              "Unable to load PDF library."
            )
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
  // FORMAT HELPERS
  // ===================================================

  function number(value) {
    return Number(value || 0)
      .toLocaleString("en-US");
  }

  function decimal(value) {
    return Number(value || 0).toFixed(1);
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

  function safeText(value) {
    return String(value ?? "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/\u2265/g, ">=")
      .replace(/\u2264/g, "<=");
  }

  // ===================================================
  // GENERATE PDF
  // ===================================================

  async function downloadPDF(report) {
    if (
      !report ||
      !report.summary ||
      !report.range
    ) {
      throw new Error(
        "Valid report statistics are required."
      );
    }

    const jsPDF = await loadPDFLibrary();

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

    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    const bottom = pageHeight - 21;

    let y = 18;

    doc.setProperties({
      title: "Operational Fatigue Risk Report",
      subject: "LCAD Fatigue Risk Analysis",
      author: "Atlas Emergency Systems",
      creator: "Atlas Emergency Systems"
    });

    // =================================================
    // DOCUMENT LAYOUT HELPERS
    // =================================================

    function font(
      size = 10,
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
        "ATLAS EMERGENCY SYSTEMS",
        margin,
        13
      );

      font(8, COLORS.muted);

      doc.text(
        "LCAD | Operational Fatigue Risk Report",
        pageWidth - margin,
        13,
        { align: "right" }
      );

      doc.setDrawColor(COLORS.border);

      doc.line(
        margin,
        17,
        pageWidth - margin,
        17
      );

      y = 24;
    }

    function ensureSpace(height) {
      if (y + height > bottom) {
        newPage();
      }
    }

    function paragraph(
      text,
      size = 10,
      color = COLORS.text
    ) {
      font(size, color);

      const lines = doc.splitTextToSize(
        safeText(text),
        contentWidth
      );

      const lineHeight = size * 0.43;

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

      y += 3;
    }

    function section(title) {
      ensureSpace(18);

      y += 3;

      font(13, COLORS.navy, "bold");

      doc.text(
        safeText(title),
        margin,
        y
      );

      y += 4;

      doc.setDrawColor(COLORS.border);

      doc.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 7;
    }

    function smallHeading(title) {
      ensureSpace(12);

      font(10, COLORS.navy, "bold");

      doc.text(
        safeText(title),
        margin,
        y
      );

      y += 6;
    }

    function tableRow(label, value) {
      ensureSpace(9);

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
        { align: "right" }
      );

      y += 3;

      doc.setDrawColor(COLORS.border);

      doc.line(
        margin,
        y,
        pageWidth - margin,
        y
      );

      y += 5;
    }

    // =================================================
    // KPI CARD
    // =================================================

    function metricCard(
      x,
      top,
      width,
      label,
      value,
      subtitle,
      color
    ) {
      doc.setFillColor(COLORS.light);

      doc.roundedRect(
        x,
        top,
        width,
        26,
        2,
        2,
        "F"
      );

      font(9, COLORS.muted);

      doc.text(
        safeText(label),
        x + 4,
        top + 6
      );

      font(
        22,
        color || COLORS.navy,
        "bold"
      );

      doc.text(
        safeText(value),
        x + 4,
        top + 16
      );

      if (subtitle) {
        font(8, COLORS.muted);

        doc.text(
          safeText(subtitle),
          x + 4,
          top + 22
        );
      }
    }

    // =================================================
    // HORIZONTAL BAR CHART
    // =================================================

    function horizontalBar(
      label,
      value,
      percentage,
      color
    ) {
      ensureSpace(16);

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
        { align: "right" }
      );

      y += 3;

      doc.setFillColor(COLORS.light);

      doc.roundedRect(
        margin,
        y,
        contentWidth,
        4.5,
        1,
        1,
        "F"
      );

      const width =
        contentWidth *
        Math.min(
          100,
          Math.max(0, percentage)
        ) / 100;

      if (width > 0) {
        doc.setFillColor(color);

        doc.rect(
          margin,
          y,
          width,
          4.5,
          "F"
        );
      }

      y += 11;
    }

    // =================================================
    // REPORT HEADER
    // =================================================

    doc.setFillColor(COLORS.navy);

    doc.rect(
      0,
      0,
      pageWidth,
      5,
      "F"
    );

    font(9, COLORS.navy, "bold");

    doc.text(
      "ATLAS EMERGENCY SYSTEMS",
      margin,
      y
    );

    y += 11;

    font(21, COLORS.dark, "bold");

    const titleLines = doc.splitTextToSize(
      "Operational Fatigue Risk Report",
      contentWidth
    );

    for (const line of titleLines) {
      doc.text(line, margin, y);
      y += 8;
    }

    font(12, COLORS.text);

    doc.text(
      report.agencyName,
      margin,
      y
    );

    y += 7;

    paragraph(
      "Reporting period: " +
      dateLabel(report.range.startDate) +
      " through " +
      dateLabel(report.range.endDate),
      9,
      COLORS.muted
    );

    paragraph(
      "Generated: " +
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone: "America/Chicago",
          dateStyle: "medium",
          timeStyle: "short"
        }
      ).format(
        new Date(report.range.generatedAt)
      ) +
      " Central Time",
      8,
      COLORS.muted
    );

    // =================================================
    // SECTION 1
    // EXECUTIVE SUMMARY
    // =================================================

    section(
      "01 - Executive Summary and Key Metrics"
    );

    ensureSpace(60);

    const cardGap = 4;

    const cardWidth =
      (contentWidth - cardGap) / 2;

    const rightCard =
      margin + cardWidth + cardGap;

    metricCard(
      margin,
      y,
      cardWidth,
      "Total Assessments",
      number(report.summary.totalAssessments)
    );

    metricCard(
      rightCard,
      y,
      cardWidth,
      "Average Fatigue Score",
      report.summary.averageScore === null
        ? "N/A"
        : decimal(report.summary.averageScore)
    );

    y += 30;

    metricCard(
      margin,
      y,
      cardWidth,
      "High Risk",
      number(report.summary.highRisk),
      "Scores greater than 12",
      COLORS.red
    );

    metricCard(
      rightCard,
      y,
      cardWidth,
      "Peer-Support Requests",
      number(report.summary.peerSupportRequests)
    );

    y += 34;

    const redCount =
      report.riskDistribution.find(
        item => item.risk === "RED"
      )?.count || 0;

    if (report.summary.totalAssessments > 0) {
      paragraph(
        `${number(report.summary.totalAssessments)} ` +
        "assessments were recorded during the " +
        "selected reporting period. " +
        `${number(redCount)} were classified as RED, ` +
        `and ${number(report.summary.highRisk)} ` +
        "exceeded the High Risk reporting " +
        "threshold of 12."
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
      "02 - Fatigue Risk Distribution"
    );

    for (const risk of report.riskDistribution) {
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
          decimal(risk.percentage) +
          "%)",
        risk.percentage,
        RISK_COLORS[risk.risk] ||
          COLORS.unknown
      );
    }

    paragraph(
      "Risk classification: GREEN <4; " +
      "YELLOW 4 to <7; ORANGE 7 to <10; " +
      "RED >=10. High Risk (>12) is a " +
      "separate reporting measure and does " +
      "not change alert thresholds.",
      8,
      COLORS.muted
    );

    // =================================================
    // SECTION 3
    // DAILY PARTICIPATION
    // =================================================

    newPage();

    section(
      "03 - Daily Assessment Participation"
    );

    ensureSpace(32);

    metricCard(
      margin,
      y,
      cardWidth,
      "Morning Assessments",
      number(report.participation.totalMorning),
      "0700-0959",
      COLORS.morning
    );

    metricCard(
      rightCard,
      y,
      cardWidth,
      "Overnight Assessments",
      number(report.participation.totalOvernight),
      "2200-0559",
      COLORS.overnight
    );

    y += 34;

    paragraph(
      "Morning assessments are assigned to their " +
      "calendar date. Overnight assessments " +
      "completed after midnight are assigned " +
      "to the preceding operational night. " +
      "All times use Central Time."
    );

    // Group participation data by calendar month.

    const months = new Map();

    for (const day of report.participation.daily) {
      const key = day.date.slice(0, 7);

      if (!months.has(key)) {
        months.set(key, []);
      }

      months.get(key).push(day);
    }

    // =================================================
    // MONTHLY PAIRED-COLUMN CHART
    // =================================================

    function dailyChart(month, days) {
      ensureSpace(90);

      smallHeading(monthLabel(month));

      const chartX = margin + 10;
      const chartY = y + 10;
      const chartW = contentWidth - 13;
      const chartH = 45;
      const chartBottom = chartY + chartH;

      const maximum = Math.max(
        1,
        ...days.map(
          day => Math.max(
            day.morning,
            day.overnight
          )
        )
      );

      const step = Math.max(
        1,
        Math.ceil(maximum / 6)
      );

      const axisMaximum =
        Math.ceil(maximum / step) * step;

      const groupWidth =
        chartW / days.length;

      const barWidth =
        Math.min(
          groupWidth * 0.34,
          5
        );

      // Legend.

      doc.setFillColor(COLORS.morning);

      doc.rect(
        margin,
        y,
        3,
        3,
        "F"
      );

      font(8, COLORS.text);

      doc.text(
        "Morning",
        margin + 5,
        y + 2.7
      );

      doc.setFillColor(COLORS.overnight);

      doc.rect(
        margin + 34,
        y,
        3,
        3,
        "F"
      );

      doc.text(
        "Operational night",
        margin + 39,
        y + 2.7
      );

      // Horizontal grid lines.

      for (
        let tick = 0;
        tick <= axisMaximum;
        tick += step
      ) {
        const tickY =
          chartBottom -
          (tick / axisMaximum) *
          chartH;

        doc.setDrawColor(COLORS.border);
        doc.setLineWidth(0.15);

        doc.line(
          chartX,
          tickY,
          chartX + chartW,
          tickY
        );

        font(7, COLORS.muted);

        doc.text(
          String(tick),
          chartX - 2,
          tickY + 1,
          { align: "right" }
        );
      }

      // Daily columns.

      days.forEach((day, index) => {
        const center =
          chartX +
          groupWidth * (index + 0.5);

        const morningHeight =
          day.morning /
          axisMaximum *
          chartH;

        const overnightHeight =
          day.overnight /
          axisMaximum *
          chartH;

        if (morningHeight > 0) {
          doc.setFillColor(COLORS.morning);

          doc.rect(
            center - barWidth - 0.2,
            chartBottom - morningHeight,
            barWidth,
            morningHeight,
            "F"
          );
        }

        if (overnightHeight > 0) {
          doc.setFillColor(COLORS.overnight);

          doc.rect(
            center + 0.2,
            chartBottom - overnightHeight,
            barWidth,
            overnightHeight,
            "F"
          );
        }

        font(6.5, COLORS.text);

        doc.text(
          String(
            Number(day.date.slice(8, 10))
          ) +
          (
            day.overnightComplete
              ? ""
              : "*"
          ),
          center,
          chartBottom + 4,
          { align: "center" }
        );
      });

      font(8, COLORS.muted);

      doc.text(
        "Day of month",
        chartX + chartW / 2,
        chartBottom + 10,
        { align: "center" }
      );

      y = chartBottom + 16;

      const morningTotal = days.reduce(
        (sum, day) => sum + day.morning,
        0
      );

      const overnightTotal = days.reduce(
        (sum, day) => sum + day.overnight,
        0
      );

      paragraph(
        "Morning: " +
        number(morningTotal) +
        " | Operational night: " +
        number(overnightTotal),
        9,
        COLORS.text
      );

      if (
        days.some(
          day => !day.overnightComplete
        )
      ) {
        paragraph(
          "* Operational night not yet complete.",
          8,
          COLORS.muted
        );
      }

      y += 4;
    }

    for (const [month, days] of months) {
      dailyChart(month, days);
    }

    tableRow(
      "Completed nights without assessments",
      number(
        report.participation.zeroOvernightDays
      )
    );

    tableRow(
      "Incomplete operational nights",
      number(
        report.participation.incompleteOvernightDays
      )
    );

    paragraph(
      "The participation chart includes " +
      "next-day assessments belonging to the " +
      "final operational night. Other report " +
      "statistics use actual calendar " +
      "completion dates. Consequently, these " +
      "sections may use different record sets.",
      8,
      COLORS.muted
    );

    // =================================================
    // SECTION 4
    // CONTRIBUTING FATIGUE FACTORS
    // =================================================

    newPage();

    section(
      "04 - Contributing Fatigue Factors"
    );

    paragraph(
      "Distribution of attributable fatigue " +
      "scoring points across established " +
      "assessment categories."
    );

    for (const factor of report.factors.categories) {
      horizontalBar(
        factor.title,
        number(factor.points) +
          " pts (" +
          decimal(factor.percentage) +
          "%)",
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

    paragraph(
      "Historical weighted scores are preserved. " +
      "Circadian contributions are inferred " +
      "from historical score differences " +
      "when consistent with established " +
      "scoring rules. These percentages describe " +
      "scoring contributions, not proven causes " +
      "of fatigue.",
      8,
      COLORS.muted
    );

    // =================================================
    // SECTION 5
    // PROVIDER SELF-ASSESSMENT
    // =================================================

    section(
      "05 - Provider Self-Assessment Trends"
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
          decimal(item.percentage) +
          "%)",
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

    paragraph(
      "Response percentages are calculated " +
      "using valid self-assessment responses. " +
      "Differences between perceived readiness " +
      "and calculated fatigue risk may identify " +
      "opportunities for education and review.",
      8,
      COLORS.muted
    );

    // =================================================
    // SECTION 6
    // ADMINISTRATIVE RECOMMENDATIONS
    // =================================================

    newPage();

    section(
      "06 - Administrative Recommendations"
    );

    for (
      const recommendation of
      report.recommendations
    ) {
      ensureSpace(25);

      smallHeading(
        recommendation.title
      );

      paragraph(
        recommendation.text
      );

      y += 3;
    }

    paragraph(
      "These recommendations are generated " +
      "using predefined analytical rules. " +
      "They support administrative review " +
      "and do not independently determine " +
      "provider fitness for duty.",
      8,
      COLORS.muted
    );

    // =================================================
    // DATA QUALITY AND METHODOLOGY
    // =================================================

    section(
      "Reporting Methodology and Data Quality"
    );

    tableRow(
      "Missing or invalid assessment scores",
      number(report.summary.missingScoreCount)
    );

    tableRow(
      "Missing peer-support responses",
      number(report.summary.peerSupportMissing)
    );

    tableRow(
      "Missing self-assessment responses",
      number(
        report.selfAssessment.missingResponses
      )
    );

    tableRow(
      "Assessments with no scoring answers",
      number(
        report.factors.missingAnswerAssessments
      )
    );

    tableRow(
      "Invalid scoring records",
      number(
        report.factors.invalidScoreAssessments
      )
    );

    tableRow(
      "Unreconciled assessment scores",
      number(
        report.factors.discrepantAssessments
      )
    );

    tableRow(
      "Assessments with inferred circadian points",
      number(
        report.factors.inferredCircadianAssessments
      )
    );

    paragraph(
      "Reports count assessment submissions, " +
      "not unique providers. Assessment counts " +
      "alone do not establish compliance rates, " +
      "staffing exposure, or fatigue prevalence " +
      "among individual employees.",
      8,
      COLORS.muted
    );

    paragraph(
      "Provider names are excluded from this " +
      "report. Aggregate peer-support statistics " +
      "are intended for confidential " +
      "administrative use.",
      8,
      COLORS.muted
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

      doc.setDrawColor(COLORS.border);

      doc.line(
        margin,
        pageHeight - 16,
        pageWidth - margin,
        pageHeight - 16
      );

      font(7, COLORS.muted);

      doc.text(
        "CONFIDENTIAL - ADMINISTRATIVE USE ONLY",
        margin,
        pageHeight - 11
      );

      doc.text(
        `Page ${page} of ${totalPages}`,
        pageWidth - margin,
        pageHeight - 11,
        { align: "right" }
      );

      doc.text(
        "Atlas Emergency Systems | LCAD",
        margin,
        pageHeight - 7
      );
    }

    // =================================================
    // DOWNLOAD
    // =================================================

    const filename =
      "LCAD_Fatigue_Report_" +
      report.range.startDate +
      "_to_" +
      report.range.endDate +
      ".pdf";

    doc.save(filename);
  }

  // ===================================================
  // CONNECT PDF MODULE TO REPORTING INTERFACE
  // ===================================================

  const originalInitialize =
    initializeReporting;

  initializeReporting = function () {
    originalInitialize();

    const button =
      document.getElementById(
        "generateReportButton"
      );

    if (!reportingBusy) {
      button.textContent =
        "Generate PDF Report";
    }

    const status =
      document.getElementById(
        "reportingStatus"
      );

    if (!latestFatigueReport) {
      status.textContent =
        "Select a reporting period to " +
        "generate your PDF report.";
    }
  };

  // ===================================================
  // GENERATE AND DOWNLOAD REPORT
  // ===================================================

  generateFatigueReport = async function () {
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
      "Retrieving assessment data and " +
      "generating your PDF report...";

    try {
      latestFatigueReport =
        await buildFatigueReport();

      await downloadPDF(
        latestFatigueReport
      );

      renderReportingPreview(
        latestFatigueReport
      );

      const confirmation =
        document.createElement("p");

      confirmation.textContent =
        "PDF report generated. " +
        "Check your browser downloads.";

      confirmation.style.cssText = `
        color: #15803d;
        font-weight: 700;
        margin: 12px 0;
      `;

      status.prepend(confirmation);

      // Update outdated development-stage text.

      const paragraphs =
        status.querySelectorAll("p");

      for (const paragraph of paragraphs) {
        if (
          paragraph.textContent.includes(
            "PDF generation will be added"
          )
        ) {
          paragraph.textContent =
            "These statistics are included in " +
            "the generated PDF report. " +
            "Provider names are excluded.";
        }
      }

    } catch (error) {
      console.error(
        "PDF report generation failed:",
        error?.message || "Unknown error"
      );

      status.textContent =
        error?.message ||
        "Unable to generate PDF report.";

    } finally {
      reportingBusy = false;

      button.disabled = false;

      button.textContent =
        "Generate PDF Report";
    }
  };

})();
