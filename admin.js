
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const ADMIN_PASSWORD = "admin2262";

const FATIGUE_QUESTIONS = {
  calls: "77a0074a-ffa3-4156-b7c1-09a419f00fc2",
  transports: "1ca0ebec-6e2e-49d2-88e7-9a7aac5cb538",
  overnight: "20f47d94-8a62-4c77-a8ce-d7d541279ed4",
  travel: "2e9105a8-a742-4a2e-b313-025ec156ed1c"
};

// Categories use question IDs rather than wording.
const CATEGORIES = [
  {
    key: "rest",
    title: "Current Rest",
    ids: [
      "21e4e34a-23e8-4cba-b295-dd12c71e7a88",
      "b0992980-f97f-42b9-a4c8-969f4730f8e6",
      "21e289f3-34c6-48df-9341-e7ae23cc87b2",
      "b30a0a28-d0be-4632-9b6b-3ab43a82798d",
      "1e022b95-67ae-42bb-90c3-9675b621517b"
    ]
  },
  {
    key: "debt",
    title: "Incurred Sleep Debt",
    ids: [
      "cca17d71-5de6-4767-96b4-d7910e5c90a3",
      "c88f8038-ce4d-4496-b851-c9f6367c566a"
    ]
  },
  {
    key: "workload",
    title: "Workload",
    ids: [
      "0ef1d345-8736-4ca3-b05d-bcaf5851e0e3",
      "c38b244a-4e10-4533-a96f-d5e6f655ba31",
      ...Object.values(FATIGUE_QUESTIONS),
      "c94e61f0-257b-459f-946f-f471fb962ae7",
      "05994f1b-de03-40be-ad7f-c0b83f45b9b7"
    ]
  },
  {
    key: "circadian",
    title: "Circadian Factors",
    ids: []
  },
  {
    key: "additional",
    title: "Additional Risk Factors",
    ids: [
      "23ff89a5-1bd3-48d8-9ac5-26875d6f86c9",
      "8ecad03b-9e35-4fc0-aaa4-cfb4bd5647c5",
      "c93bd0a1-3247-4821-b7fa-9cb7fd03874b",
      "e1bf6d0d-4040-4015-ba18-03d46ff8c127",
      "a4654958-02e5-4f9a-a01d-dc9a170dc341"
    ]
  }
];

const CATEGORY_LOOKUP = new Map();

CATEGORIES.forEach(category => {
  category.ids.forEach(id => {
    CATEGORY_LOOKUP.set(id, category.key);
  });
});

// =====================================================
// LOGIN
// =====================================================

function login() {
  const entered = document.getElementById("passwordInput").value;

  if (entered !== ADMIN_PASSWORD) {
    alert("Incorrect password");
    return;
  }

  document.getElementById("login").style.display = "none";
  document.getElementById("adminPanel").style.display = "block";

  loadAssessments();
}

// =====================================================
// HELPERS
// =====================================================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPoints(value) {
  const number = Number(value) || 0;
  const formatted = Number(number.toFixed(2));

  return formatted > 0
    ? "+" + formatted
    : String(formatted);
}

function parseOptions(options) {
  if (!options) return [];

  try {
    const parsed = typeof options === "string"
      ? JSON.parse(options)
      : options;

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Option parse error:", error);
    return [];
  }
}

function getOptionLabel(options, value) {
  const option = options.find(
    item => String(item.value) === String(value)
  );

  return option ? option.label : String(value);
}

function formatAnswer(answer) {
  const question = answer.questions;

  if (!question) {
    return String(answer.value ?? "");
  }

  if (question.type === "boolean") {
    return Number(answer.value) === 1 ? "Yes" : "No";
  }

  if (question.type === "select") {
    return getOptionLabel(
      parseOptions(question.options),
      answer.value
    );
  }

  if (question.type === "multiselect") {
    try {
      const selected = typeof answer.value === "string"
        ? JSON.parse(answer.value)
        : answer.value;

      if (!Array.isArray(selected)) {
        return String(answer.value ?? "");
      }

      if (selected.length === 0) {
        return "None selected";
      }

      const options = parseOptions(question.options);

      return selected
        .map(value => getOptionLabel(options, value))
        .join(", ");
    } catch (error) {
      console.error("Multiselect parse error:", error);
      return String(answer.value ?? "");
    }
  }

  return String(answer.value ?? "");
}

// =====================================================
// FATIGUE UNIT BREAKDOWN
// =====================================================

function getFatigueAnswer(answers, key) {
  const answer = answers.find(
    item => item.question_id === FATIGUE_QUESTIONS[key]
  );

  return answer ? Number(answer.value) || 0 : 0;
}

function getFatigueBreakdown(answers) {
  const callsAnswer = answers.find(
    item => item.question_id === FATIGUE_QUESTIONS.calls
  );

  if (!callsAnswer) return null;

  const calls = getFatigueAnswer(answers, "calls");
  const transports = getFatigueAnswer(answers, "transports");
  const overnight = getFatigueAnswer(answers, "overnight");
  const travelHours = getFatigueAnswer(answers, "travel");

  const roundedTravelHours = Math.floor(travelHours + 0.5);

  const fatigueUnits = calls === 0
    ? 0
    : calls + transports + overnight + roundedTravelHours;

  return {
    calls,
    transports,
    overnight,
    travelHours,
    roundedTravelHours,
    fatigueUnits,
    storedFatiguePoints: Number(callsAnswer.weighted_score) || 0
  };
}

// =====================================================
// RISK COLOR
// =====================================================

function getRiskStyle(color) {
  const styles = {
    GREEN: {
      background: "#e6f4ea",
      color: "#176b35"
    },
    YELLOW: {
      background: "#fff6d6",
      color: "#775600"
    },
    ORANGE: {
      background: "#fff0df",
      color: "#a34b00"
    },
    RED: {
      background: "#fce8e6",
      color: "#a61b1b"
    }
  };

  return styles[String(color).toUpperCase()] || {
    background: "#f1f3f5",
    color: "#333333"
  };
}

// =====================================================
// RENDER QUESTION
// =====================================================

function renderAnswerRow(answer) {
  const questionText =
    answer.questions?.text || "Unknown question";

  const value = formatAnswer(answer);
  const points = Number(answer.weighted_score) || 0;

  const isCalls =
    answer.question_id === FATIGUE_QUESTIONS.calls;

  const isOtherFatigue =
    Object.values(FATIGUE_QUESTIONS).includes(
      answer.question_id
    ) && !isCalls;

  const note = isCalls
    ? "Combined fatigue score for all four activity questions"
    : isOtherFatigue
      ? "Included in combined fatigue calculation"
      : "";

  return `
    <div class="admin-answer-row">
      <div class="admin-answer-content">
        <div class="admin-question-text">
          ${escapeHTML(questionText)}
        </div>

        <div class="admin-answer-value">
          ${escapeHTML(value)}
        </div>

        ${
          note
            ? `<div class="admin-scoring-note">
                 ${escapeHTML(note)}
               </div>`
            : ""
        }
      </div>

      <div class="admin-answer-points">
        ${escapeHTML(formatPoints(points))}
      </div>
    </div>
  `;
}

// =====================================================
// RENDER FATIGUE BREAKDOWN
// =====================================================

function renderFatigueBreakdown(fatigue) {
  if (!fatigue) return "";

  return `
    <div class="admin-breakdown admin-fatigue-breakdown">

      <div class="admin-section-title">
        Fatigue Unit Breakdown
      </div>

      <div class="admin-breakdown-row">
        <span>Calls</span>
        <strong>${fatigue.calls}</strong>
      </div>

      <div class="admin-breakdown-row">
        <span>Transports</span>
        <strong>${fatigue.transports}</strong>
      </div>

      <div class="admin-breakdown-row">
        <span>Overnight calls</span>
        <strong>${fatigue.overnight}</strong>
      </div>

      <div class="admin-breakdown-row">
        <span>
          Travel hours
          (${fatigue.travelHours} rounded to
          ${fatigue.roundedTravelHours})
        </span>
        <strong>
          ${fatigue.calls === 0
            ? 0
            : fatigue.roundedTravelHours}
        </strong>
      </div>

      <div class="admin-breakdown-row admin-total-row">
        <span>Total fatigue units</span>
        <strong>${fatigue.fatigueUnits}</strong>
      </div>

      <div class="admin-breakdown-row">
        <span>Stored fatigue points</span>
        <strong>
          ${formatPoints(fatigue.storedFatiguePoints)}
        </strong>
      </div>

      <div class="admin-scoring-note">
        Current tiers: 0–10 units = 0 points;
        11–15 = 3 points; 16+ = 6 points.
        Historical assessments retain their stored scores.
      </div>

    </div>
  `;
}

// =====================================================
// CATEGORY GROUPING AND TOTALS
// =====================================================

function buildAssessmentDetails(answers, totalScore) {
  const groups = Object.fromEntries(
    CATEGORIES.map(category => [category.key, []])
  );

  const subtotals = Object.fromEntries(
    CATEGORIES.map(category => [category.key, 0])
  );

  const unclassified = [];
  let storedQuestionTotal = 0;

  // Assign each saved question to exactly one category.
  answers.forEach(answer => {
    const points = Number(answer.weighted_score) || 0;

    storedQuestionTotal += points;

    const category = CATEGORY_LOOKUP.get(answer.question_id);

    if (category) {
      groups[category].push(answer);
      subtotals[category] += points;
    } else {
      unclassified.push(answer);
    }
  });

  // ===================================================
  // CIRCADIAN SCORE RECONCILIATION
  // ===================================================

  // The current assessment app adds circadian points
  // directly to total_score without saving a separate
  // answer record.
  //
  // A difference of 0, 1 or 2 is consistent with the
  // circadian scoring rules. Any other difference is
  // flagged rather than assigned to circadian factors.

  const residual = Number(
    (totalScore - storedQuestionTotal).toFixed(2)
  );

  const inferredCircadian = [0, 1, 2].includes(residual)
    ? residual
    : null;

  if (inferredCircadian !== null) {
    subtotals.circadian = inferredCircadian;
  }

  // ===================================================
  // CATEGORY QUESTION SECTIONS
  // ===================================================

  let categoryHTML = "";

  CATEGORIES.forEach(category => {
    const categoryAnswers = groups[category.key];

    let rows = categoryAnswers
      .map(renderAnswerRow)
      .join("");

    if (category.key === "circadian") {
      rows = `
        <div class="admin-answer-row">
          <div class="admin-answer-content">
            <div class="admin-question-text">
              Automatic circadian adjustment
            </div>

            <div class="admin-answer-value">
              ${
                inferredCircadian === null
                  ? "Unable to determine reliably from saved totals"
                  : "Inferred from saved score difference (not stored separately)"
              }
            </div>
          </div>

          <div class="admin-answer-points">
            ${
              inferredCircadian === null
                ? "—"
                : formatPoints(inferredCircadian)
            }
          </div>
        </div>
      `;
    } else if (!rows) {
      rows = `
        <p class="admin-empty-category">
          No responses recorded in this category.
        </p>
      `;
    }

    const subtotalLabel =
      category.key === "circadian" &&
      inferredCircadian === null
        ? "Unverified"
        : formatPoints(subtotals[category.key]);

    categoryHTML += `
      <section class="admin-category-section">

        <div class="admin-category-heading">
          <span>${escapeHTML(category.title)}</span>
          <strong>${escapeHTML(subtotalLabel)}</strong>
        </div>

        <div class="admin-answer-heading">
          <span>Question / Answer</span>
          <span>Points</span>
        </div>

        ${rows}

        <div class="admin-category-subtotal">
          <span>
            ${escapeHTML(category.title)} subtotal
          </span>

          <strong>
            ${escapeHTML(subtotalLabel)}
          </strong>
        </div>

      </section>
    `;
  });

  // Do not silently discard questions added to Supabase
  // that have not yet been assigned to a category.

  const unclassifiedTotal = unclassified.reduce(
    (sum, answer) =>
      sum + (Number(answer.weighted_score) || 0),
    0
  );

  if (unclassified.length > 0) {
    categoryHTML += `
      <section class="admin-category-section">
        <div class="admin-category-heading">
          <span>
            Unclassified Questions — Review Required
          </span>

          <strong>
            ${formatPoints(unclassifiedTotal)}
          </strong>
        </div>

        ${unclassified.map(renderAnswerRow).join("")}
      </section>
    `;
  }

  // ===================================================
  // FINAL CATEGORY SCORING SUMMARY
  // ===================================================

  const categorySummary = CATEGORIES.map(category => {
    const label =
      category.key === "circadian" &&
      inferredCircadian === null
        ? "Unverified"
        : formatPoints(subtotals[category.key]);

    return `
      <div class="admin-breakdown-row">
        <span>${escapeHTML(category.title)}</span>
        <strong>${escapeHTML(label)}</strong>
      </div>
    `;
  }).join("");

  const classifiedTotal = Object.values(subtotals)
    .reduce((sum, points) => sum + points, 0);

  const unresolved = Number(
    (
      totalScore -
      classifiedTotal -
      unclassifiedTotal
    ).toFixed(2)
  );

  const discrepancyHTML = inferredCircadian === null
    ? `
      <div class="admin-breakdown-row admin-warning-row">
        <span>
          Unattributed score difference —
          review required
        </span>

        <strong>${formatPoints(residual)}</strong>
      </div>
    `
    : "";

  const unclassifiedHTML = unclassified.length
    ? `
      <div class="admin-breakdown-row admin-warning-row">
        <span>Unclassified question points</span>
        <strong>${formatPoints(unclassifiedTotal)}</strong>
      </div>
    `
    : "";

  const needsReview =
    inferredCircadian === null ||
    unclassified.length > 0 ||
    Math.abs(unresolved) > 0.001;

  const reconciliationNote = needsReview
    ? `
      <div class="admin-scoring-note">
        Review this assessment: the category breakdown
        cannot be fully verified against the saved total.
      </div>
    `
    : `
      <div class="admin-scoring-note">
        Category points reconcile to the saved assessment
        total. Circadian points are inferred, not
        individually stored.
      </div>
    `;

  const fatigueHTML = renderFatigueBreakdown(
    getFatigueBreakdown(answers)
  );

  return `
    ${categoryHTML}

    ${fatigueHTML}

    <div class="admin-breakdown admin-category-summary">

      <div class="admin-section-title">
        Category Scoring Summary
      </div>

      ${categorySummary}

      ${unclassifiedHTML}

      ${discrepancyHTML}

      <div class="admin-breakdown-row admin-total-row">
        <span>Total Assessment Score</span>
        <strong>${escapeHTML(totalScore)}</strong>
      </div>

      ${reconciliationNote}

    </div>
  `;
}

// =====================================================
// LOAD ASSESSMENTS
// =====================================================

async function loadAssessments() {
  const container = document.getElementById(
    "assessmentList"
  );

  container.textContent = "Loading assessments...";

  const { data: assessments, error } = await supabaseClient
    .from("assessments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading assessments:", error);
    container.textContent = "Error loading assessments.";
    alert("Error loading assessments");
    return;
  }

  container.replaceChildren();

  if (!assessments?.length) {
    container.textContent = "No assessments found.";
    return;
  }

  for (const assessment of assessments) {
    const { data: answers, error: answerError } =
      await supabaseClient
        .from("answers")
        .select(`
          question_id,
          value,
          weighted_score,
          questions (
            text,
            type,
            options,
            order_index
          )
        `)
        .eq("assessment_id", assessment.id);

    if (answerError) {
      console.error(
        "Error loading answers:",
        assessment.id,
        answerError
      );
    }

    const answerList = answers || [];

    answerList.sort((a, b) => {
      return (
        Number(a.questions?.order_index ?? 9999) -
        Number(b.questions?.order_index ?? 9999)
      );
    });

    const formattedDate = new Date(
      assessment.created_at
    ).toLocaleString();

    const totalScore =
      Number(assessment.total_score) || 0;

    const riskColor = String(
      assessment.risk_color || ""
    ).toUpperCase();

    const riskStyle = getRiskStyle(riskColor);

    // =================================================
    // CREATE ASSESSMENT BLOCK
    // =================================================

    const block = document.createElement("div");
    block.className = "admin-assessment-block";

    const header = document.createElement("div");
    header.className = "admin-assessment-header";
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", "false");

    header.innerHTML = `
      <div class="admin-header-main">
        <strong>${escapeHTML(formattedDate)}</strong>

        <span class="admin-header-score">
          Score: ${escapeHTML(totalScore)}
        </span>
      </div>

      <div class="admin-header-right">
        <span
          class="admin-risk-badge"
          style="
            background:${riskStyle.background};
            color:${riskStyle.color};
          "
        >
          ${escapeHTML(riskColor)}
        </span>

        <span class="admin-expand-icon">+</span>
      </div>
    `;

    const details = document.createElement("div");
    details.className = "admin-assessment-details";
    details.style.display = "none";

    if (answerError) {
      details.innerHTML = `
        <p>
          Unable to load answers for this assessment.
          Category totals cannot be calculated.
        </p>
      `;
    } else {
      details.innerHTML = buildAssessmentDetails(
        answerList,
        totalScore
      );
    }

    header.addEventListener("click", () => {
      toggleDetails(header);
    });

    header.addEventListener("keydown", event => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        toggleDetails(header);
      }
    });

    block.append(header, details);
    container.appendChild(block);
  }
}

// =====================================================
// EXPAND / COLLAPSE
// =====================================================

function toggleDetails(header) {
  const details = header.nextElementSibling;
  const isOpen = details.style.display !== "none";

  details.style.display = isOpen ? "none" : "block";

  header.setAttribute(
    "aria-expanded",
    String(!isOpen)
  );

  const icon = header.querySelector(
    ".admin-expand-icon"
  );

  if (icon) {
    icon.textContent = isOpen ? "+" : "−";
  }
}
