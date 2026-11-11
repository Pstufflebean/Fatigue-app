
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const ADMIN_PASSWORD = "admin2262";

// =====================================================
// FATIGUE QUESTION UUIDS
// =====================================================

const FATIGUE_QUESTIONS = {
  calls: "77a0074a-ffa3-4156-b7c1-09a419f00fc2",
  transports: "1ca0ebec-6e2e-49d2-88e7-9a7aac5cb538",
  overnight: "20f47d94-8a62-4c77-a8ce-d7d541279ed4",
  travel: "2e9105a8-a742-4a2e-b313-025ec156ed1c"
};

// =====================================================
// LOGIN
// =====================================================

function login() {
  const entered = document.getElementById(
    "passwordInput"
  ).value;

  if (entered === ADMIN_PASSWORD) {
    document.getElementById("login").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";

    loadAssessments();
  } else {
    alert("Incorrect password");
  }
}

// =====================================================
// HELPER FUNCTIONS
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

  if (number === 0) {
    return "0";
  }

  const formatted = Number(number.toFixed(2));

  return (formatted > 0 ? "+" : "") + formatted;
}

function parseOptions(options) {
  if (!options) {
    return [];
  }

  try {
    const parsed =
      typeof options === "string"
        ? JSON.parse(options)
        : options;

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Option parse error:", error);
    return [];
  }
}

function getOptionLabel(options, value) {
  const match = options.find(
    option => String(option.value) === String(value)
  );

  return match ? match.label : String(value);
}

function formatAnswer(ans) {
  const q = ans.questions;

  if (!q) {
    return String(ans.value ?? "");
  }

  if (q.type === "boolean") {
    return Number(ans.value) === 1 ? "Yes" : "No";
  }

  if (q.type === "select") {
    const options = parseOptions(q.options);

    return getOptionLabel(options, ans.value);
  }

  if (q.type === "multiselect") {
    const options = parseOptions(q.options);

    try {
      const selected =
        typeof ans.value === "string"
          ? JSON.parse(ans.value)
          : ans.value;

      if (!Array.isArray(selected)) {
        return String(ans.value ?? "");
      }

      if (selected.length === 0) {
        return "None selected";
      }

      return selected
        .map(value => getOptionLabel(options, value))
        .join(", ");
    } catch (error) {
      console.error("Multiselect parse error:", error);
      return String(ans.value ?? "");
    }
  }

  return String(ans.value ?? "");
}

function getFatigueAnswer(answers, key) {
  const id = FATIGUE_QUESTIONS[key];

  const answer = answers.find(
    a => a.question_id === id
  );

  return answer ? Number(answer.value) || 0 : 0;
}

function getFatigueBreakdown(answers) {
  const callsAnswer = answers.find(
    a => a.question_id === FATIGUE_QUESTIONS.calls
  );

  if (!callsAnswer) {
    return null;
  }

  const calls = getFatigueAnswer(answers, "calls");
  const transports = getFatigueAnswer(
    answers,
    "transports"
  );
  const overnight = getFatigueAnswer(
    answers,
    "overnight"
  );

  const travelHours = getFatigueAnswer(
    answers,
    "travel"
  );

  const roundedTravelHours = Math.floor(
    travelHours + 0.5
  );

  const fatigueUnits = calls === 0
    ? 0
    : calls +
      transports +
      overnight +
      roundedTravelHours;

  // Display the points actually stored in Supabase.
  // Do not overwrite historical scoring with
  // the current tiered scoring formula.

  const storedFatiguePoints =
    Number(callsAnswer.weighted_score) || 0;

  return {
    calls,
    transports,
    overnight,
    travelHours,
    roundedTravelHours,
    fatigueUnits,
    storedFatiguePoints
  };
}

function getRiskStyle(color) {
  switch (String(color).toUpperCase()) {
    case "GREEN":
      return {
        background: "#e6f4ea",
        color: "#176b35"
      };

    case "YELLOW":
      return {
        background: "#fff6d6",
        color: "#775600"
      };

    case "ORANGE":
      return {
        background: "#fff0df",
        color: "#a34b00"
      };

    case "RED":
      return {
        background: "#fce8e6",
        color: "#a61b1b"
      };

    default:
      return {
        background: "#f1f3f5",
        color: "#333333"
      };
  }
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

  container.innerHTML = "";

  if (!assessments || assessments.length === 0) {
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
        "Error loading answers for assessment:",
        assessment.id,
        answerError
      );
    }

    const answerList = answers || [];

    // Sort answers by question order
    answerList.sort((a, b) => {
      const aOrder = Number(
        a.questions?.order_index ?? 9999
      );

      const bOrder = Number(
        b.questions?.order_index ?? 9999
      );

      return aOrder - bOrder;
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

    const fatigue = getFatigueBreakdown(answerList);

    // =================================================
    // INDIVIDUAL QUESTION ROWS
    // =================================================

    let answerHTML = "";

    let questionScoreTotal = 0;

    for (const ans of answerList) {
      const question = ans.questions || {};

      const questionText =
        question.text || "Unknown question";

      const displayValue = formatAnswer(ans);

      const points = Number(ans.weighted_score) || 0;

      questionScoreTotal += points;

      const isFatigueQuestion =
        Object.values(FATIGUE_QUESTIONS).includes(
          ans.question_id
        );

      const isCallsQuestion =
        ans.question_id === FATIGUE_QUESTIONS.calls;

      let scoringNote = "";

      if (isCallsQuestion) {
        scoringNote =
          "Combined fatigue score (Questions 1–4)";
      } else if (isFatigueQuestion) {
        scoringNote =
          "Included in combined fatigue calculation";
      }

      answerHTML += `
        <div class="admin-answer-row">
          <div class="admin-answer-content">
            <div class="admin-question-text">
              ${escapeHTML(questionText)}
            </div>

            <div class="admin-answer-value">
              ${escapeHTML(displayValue)}
            </div>

            ${
              scoringNote
                ? `
                  <div class="admin-scoring-note">
                    ${escapeHTML(scoringNote)}
                  </div>
                `
                : ""
            }
          </div>

          <div class="admin-answer-points">
            ${escapeHTML(formatPoints(points))}
          </div>
        </div>
      `;
    }

    // =================================================
    // FATIGUE BREAKDOWN
    // =================================================

    let fatigueHTML = "";

    if (fatigue) {
      fatigueHTML = `
        <div class="admin-breakdown">
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
            Current scoring:
            0–10 units = 0 points;
            11–15 = 3 points;
            16+ = 6 points.
            Historical assessments retain their
            originally recorded scores.
          </div>
        </div>
      `;
    }

    // =================================================
    // SCORE RECONCILIATION
    // =================================================

    // The application adds circadian points directly
    // to total_score. They are not stored as an answer.
    //
    // The difference between the assessment total
    // and stored question scores is therefore shown
    // as an unattributed adjustment. In assessments
    // generated by the current app, this should be
    // the circadian adjustment.
    //
    // Do not assume historical differences are
    // necessarily circadian.

    const adjustment = Number(
      (totalScore - questionScoreTotal).toFixed(2)
    );

    let adjustmentHTML = "";

    if (Math.abs(adjustment) > 0.001) {
      adjustmentHTML = `
        <div class="admin-breakdown-row">
          <span>
            Additional adjustment
            <small>(normally circadian)</small>
          </span>
          <strong>${formatPoints(adjustment)}</strong>
        </div>
      `;
    }

    const summaryHTML = `
      <div class="admin-breakdown">
        <div class="admin-section-title">
          Score Summary
        </div>

        <div class="admin-breakdown-row">
          <span>Stored question points</span>
          <strong>
            ${formatPoints(questionScoreTotal)}
          </strong>
        </div>

        ${adjustmentHTML}

        <div class="admin-breakdown-row admin-total-row">
          <span>Assessment total</span>
          <strong>
            ${escapeHTML(totalScore)}
          </strong>
        </div>
      </div>
    `;

    // =================================================
    // COLLAPSIBLE ASSESSMENT BLOCK
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

    details.innerHTML = `
      <div class="admin-section-title">
        Question Responses and Points
      </div>

      <div class="admin-answer-heading">
        <span>Question / Answer</span>
        <span>Points</span>
      </div>

      ${
        answerError
          ? `
            <p>
              Unable to load the answers for this
              assessment.
            </p>
          `
          : answerHTML ||
            "<p>No answers recorded.</p>"
      }

      ${answerError ? "" : fatigueHTML}

      ${answerError ? "" : summaryHTML}
    `;

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
// TOGGLE DETAILS
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
