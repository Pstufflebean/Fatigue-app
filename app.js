
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// =====================================================
// APP STATE
// =====================================================

let questions = [];
let current = 0;
let answers = [];
let totalScore = 0;
let answerMap = {};
let alertTriggered = false;
let assessmentFinishing = false;

// =====================================================
// FATIGUE QUESTION UUIDS
// =====================================================

const FATIGUE_QUESTIONS = {
  calls: "77a0074a-ffa3-4156-b7c1-09a419f00fc2",
  transports: "1ca0ebec-6e2e-49d2-88e7-9a7aac5cb538",
  overnight: "20f47d94-8a62-4c77-a8ce-d7d541279ed4",
  travel: "2e9105a8-a742-4a2e-b313-025ec156ed1c"
};

function getFatigueKey(q) {
  return Object.keys(FATIGUE_QUESTIONS).find(
    key => FATIGUE_QUESTIONS[key] === q.id
  );
}

function getFatigueQuestion(key) {
  return questions.find(
    q => q.id === FATIGUE_QUESTIONS[key]
  );
}

function getFatigueAnswer(key) {
  const q = getFatigueQuestion(key);

  if (!q || answerMap[q.id] === undefined) {
    return 0;
  }

  return Number(answerMap[q.id]) || 0;
}

// =====================================================
// FATIGUE UNIT SCORING
// =====================================================

function calculateFatigueScore() {
  const calls = getFatigueAnswer("calls");

  if (calls === 0) {
    return {
      fatigueUnits: 0,
      fatiguePoints: 0
    };
  }

  const transports = getFatigueAnswer("transports");
  const overnight = getFatigueAnswer("overnight");

  const roundedTravelHours = Math.floor(
    getFatigueAnswer("travel") + 0.5
  );

  // One fatigue unit per call, transport,
  // overnight call, and rounded travel hour.
  // No upper cap on fatigue units.

  const fatigueUnits =
    calls +
    transports +
    overnight +
    roundedTravelHours;

  // Tiered scoring:
  // 0-10 units = 0 points
  // 11-15 units = 3 points
  // 16+ units = 6 points

  let fatiguePoints = 0;

  if (fatigueUnits >= 16) {
    fatiguePoints = 6;
  } else if (fatigueUnits >= 11) {
    fatiguePoints = 3;
  }

  return {
    fatigueUnits,
    fatiguePoints
  };
}

// =====================================================
// CIRCADIAN SCORING
// =====================================================

function getCircadianScore() {
  const hour = new Date().getHours();

  if (hour >= 2 && hour < 6) {
    return 2;
  }

  if (hour < 2 || (hour >= 6 && hour < 8)) {
    return 1;
  }

  return 0;
}

// =====================================================
// START ASSESSMENT
// =====================================================

async function startAssessment() {
  current = 0;
  answers = [];
  totalScore = 0;
  questions = [];
  answerMap = {};
  alertTriggered = false;
  assessmentFinishing = false;

  document.getElementById("landing").style.display = "none";
  document.getElementById("assessment").style.display = "flex";
  document.getElementById("result").style.display = "none";

  await loadQuestions();

  if (!questions.length) {
    alert(
      "No questions found. Please check the connection and try again."
    );

    document.getElementById("assessment").style.display = "none";
    document.getElementById("landing").style.display = "flex";
    return;
  }

  window.scrollTo(0, 0);
  showQuestion();
}

// =====================================================
// LOAD QUESTIONS
// =====================================================

async function loadQuestions() {
  const { data, error } = await supabaseClient
    .from("questions")
    .select("*")
    .eq("active", true)
    .order("order_index", { ascending: true });

  if (error) {
    console.error("Error loading questions:", error);
    alert("Error loading questions");
    return;
  }

  questions = data || [];
}

// =====================================================
// CONDITIONAL QUESTIONS
// =====================================================

function shouldShowQuestion(q) {
  if (!q.condition) {
    return true;
  }

  try {
    const cond =
      typeof q.condition === "string"
        ? JSON.parse(q.condition)
        : q.condition;

    if (!cond || !cond.question_id) {
      return true;
    }

    const previous = answerMap[cond.question_id];

    if (previous === undefined) {
      return false;
    }

    if (
      cond.equals !== undefined &&
      Number(previous) !== Number(cond.equals)
    ) {
      return false;
    }

    if (
      cond.min !== undefined &&
      Number(previous) < Number(cond.min)
    ) {
      return false;
    }

    if (
      cond.max !== undefined &&
      Number(previous) > Number(cond.max)
    ) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Invalid question condition:", error, q);
    return false;
  }
}

// =====================================================
// DISPLAY QUESTION
// =====================================================

function showQuestion() {
  while (
    current < questions.length &&
    !shouldShowQuestion(questions[current])
  ) {
    current++;
  }

  if (current >= questions.length) {
    finishAssessment();
    return;
  }

  const q = questions[current];

  document.getElementById("questionText").innerText = q.text;

  const num = document.getElementById("numericInput");
  const sel = document.getElementById("selectInput");
  const txt = document.getElementById("textInput");
  const multi = document.getElementById("multiSelectInput");

  // Hide inputs
  num.style.display = "none";
  sel.style.display = "none";
  txt.style.display = "none";
  multi.style.display = "none";

  // Reset inputs
  num.value = "";
  num.removeAttribute("step");
  num.removeAttribute("min");

  sel.innerHTML = '<option value="">Select</option>';
  txt.value = "";
  multi.replaceChildren();

  // NUMERIC
  if (q.type === "numeric") {
    num.style.display = "block";

    const fatigueKey = getFatigueKey(q);

    if (fatigueKey) {
      num.min = "0";
      num.step = fatigueKey === "travel" ? "any" : "1";
    }
  }

  // BOOLEAN
  if (q.type === "boolean") {
    sel.style.display = "block";

    sel.innerHTML =
      '<option value="">Select</option>' +
      '<option value="0">No</option>' +
      '<option value="1">Yes</option>';
  }

  // SELECT
  if (q.type === "select") {
    sel.style.display = "block";

    try {
      const opts =
        typeof q.options === "string"
          ? JSON.parse(q.options)
          : q.options;

      (opts || []).forEach(o => {
        const option = document.createElement("option");

        option.value = o.value;
        option.textContent = o.label;

        sel.appendChild(option);
      });
    } catch (error) {
      console.error("Invalid select options:", error);
    }
  }

  // MULTISELECT
  if (q.type === "multiselect") {
    multi.style.display = "flex";

    try {
      const opts =
        typeof q.options === "string"
          ? JSON.parse(q.options)
          : q.options;

      (opts || []).forEach(o => {
        const label = document.createElement("label");

        label.style.cssText = `
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          width: 100%;
          padding: 12px 14px;
          box-sizing: border-box;
          border: 1px solid #ccd3dc;
          border-radius: 8px;
          background: white;
          cursor: pointer;
        `;

        const checkbox = document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.value = String(o.value);

        checkbox.style.cssText = `
          width: 20px;
          height: 20px;
          max-width: none;
          margin: 0;
          flex: 0 0 auto;
        `;

        const labelText = document.createElement("span");
        labelText.textContent = o.label;

        label.append(checkbox, labelText);
        multi.appendChild(label);
      });
    } catch (error) {
      console.error("Invalid multiselect options:", error);
    }
  }

  // TEXT
  if (q.type === "text") {
    txt.style.display = "block";
  }
}

// =====================================================
// NEXT QUESTION
// =====================================================

function nextQuestion() {
  if (
    assessmentFinishing ||
    current >= questions.length
  ) {
    return;
  }

  const q = questions[current];
  let value;

  // COLLECT ANSWER
  if (q.type === "multiselect") {
    value = Array.from(
      document.querySelectorAll(
        '#multiSelectInput input[type="checkbox"]:checked'
      ),
      el => Number(el.value)
    );
  } else if (q.type === "numeric") {
    const raw = document.getElementById("numericInput").value;

    if (raw.trim() === "") {
      return alert("Enter a number");
    }

    value = Number(raw);

    if (!Number.isFinite(value)) {
      return alert("Enter a valid number");
    }
  } else if (q.type === "text") {
    value = document.getElementById("textInput").value.trim();

    if (!value) {
      return alert("Enter a response");
    }
  } else {
    const raw = document.getElementById("selectInput").value;

    if (raw === "") {
      return alert("Select an option");
    }

    value = Number(raw);
  }

  // ===================================================
  // FATIGUE QUESTION VALIDATION
  // ===================================================

  const fatigueKey = getFatigueKey(q);

  if (fatigueKey) {
    if (!Number.isFinite(value) || value < 0) {
      return alert(
        "Enter a valid number of zero or greater."
      );
    }

    if (
      fatigueKey !== "travel" &&
      !Number.isInteger(value)
    ) {
      return alert("Enter a whole number.");
    }

    if (
      (
        fatigueKey === "transports" ||
        fatigueKey === "overnight"
      ) &&
      value > getFatigueAnswer("calls")
    ) {
      return alert(
        "This cannot exceed the total number of calls."
      );
    }
  }

  // STORE FOR CONDITIONAL LOGIC
  answerMap[q.id] = value;

  // ===================================================
  // ALERT TRACKING
  // ===================================================

  if (q.alert_trigger) {
    if (Array.isArray(value)) {
      if (value.includes(1)) {
        alertTriggered = true;
      }
    } else if (Number(value) === 1) {
      alertTriggered = true;
    }
  }

  // ===================================================
  // STANDARD QUESTION SCORING
  // ===================================================

  let score = 0;

  // Fatigue questions are scored together
  // at the end of the assessment.

  if (
    !fatigueKey &&
    q.scoring &&
    q.type !== "text"
  ) {
    try {
      const rules =
        typeof q.scoring === "string"
          ? JSON.parse(q.scoring)
          : q.scoring;

      if (q.type === "multiselect") {
        for (const selected of value) {
          const rule = (rules || []).find(
            r =>
              r.value !== undefined &&
              Number(r.value) === selected
          );

          if (rule) {
            score += Number(rule.score) || 0;
          }
        }
      } else {
        for (const rule of rules || []) {
          if (
            rule.min !== undefined &&
            rule.max !== undefined &&
            value >= Number(rule.min) &&
            value <= Number(rule.max)
          ) {
            score = Number(rule.score) || 0;
          }

          if (
            rule.value !== undefined &&
            value === Number(rule.value)
          ) {
            score = Number(rule.score) || 0;
          }
        }
      }
    } catch (error) {
      console.error("Scoring error:", error);
    }
  }

  totalScore += score;

  // SAVE INDIVIDUAL ANSWER IN MEMORY
  answers.push({
    question_id: q.id,
    value: Array.isArray(value)
      ? JSON.stringify(value)
      : String(value),
    weighted_score: score
  });

  current++;
  showQuestion();
}

// =====================================================
// RISK LEVEL
// =====================================================

function getColor(score) {
  if (score < 4) return "GREEN";
  if (score < 7) return "YELLOW";
  if (score < 10) return "ORANGE";
  return "RED";
}

// =====================================================
// FINISH ASSESSMENT
// =====================================================

async function finishAssessment() {
  if (assessmentFinishing) {
    return;
  }

  assessmentFinishing = true;

  // CALCULATE FATIGUE SCORE
  const fatigue = calculateFatigueScore();

  totalScore += fatigue.fatiguePoints;

  // Store combined fatigue score under Q1.
  // Q2-Q4 retain zero weighted_score because
  // the four questions form one scoring block.

  const callsQuestion = getFatigueQuestion("calls");

  if (callsQuestion) {
    const callsAnswer = answers.find(
      a => a.question_id === callsQuestion.id
    );

    if (callsAnswer) {
      callsAnswer.weighted_score = fatigue.fatiguePoints;
    }
  }

  // CIRCADIAN ADJUSTMENT
  const circadianScore = getCircadianScore();

  totalScore += circadianScore;
  totalScore = Number(totalScore.toFixed(2));

  console.log("Fatigue units:", fatigue.fatigueUnits);
  console.log("Fatigue points:", fatigue.fatiguePoints);
  console.log("Circadian points:", circadianScore);
  console.log("Final assessment score:", totalScore);

  const color = getColor(totalScore);

  // DISPLAY RESULT
  document.getElementById("landing").style.display = "none";
  document.getElementById("assessment").style.display = "none";
  document.getElementById("result").style.display = "flex";

  document.getElementById("resultColor").innerText =
    "Risk Level: " + color;

  window.scrollTo(0, 0);

  // ===================================================
  // SAVE TO SUPABASE
  // ===================================================

  try {
    const { data, error } = await supabaseClient
      .from("assessments")
      .insert([{
        total_score: totalScore,
        risk_color: color
      }])
      .select();

    if (error) {
      throw error;
    }

    if (!data || !data.length) {
      throw new Error("No assessment ID returned");
    }

    const assessmentId = data[0].id;

    for (const answer of answers) {
      const { error: answerError } = await supabaseClient
        .from("answers")
        .insert([{
          assessment_id: assessmentId,
          question_id: answer.question_id,
          value: answer.value,
          weighted_score: answer.weighted_score
        }]);

      if (answerError) {
        throw answerError;
      }
    }

    console.log(
      "Assessment and answers saved successfully"
    );
  } catch (error) {
    console.error("Assessment save failed:", error);

    alert(
      "Your risk level was calculated, but the assessment " +
      "could not be fully saved. Please notify your supervisor."
    );
  }

  // ===================================================
  // EMAIL ALERTS
  // ===================================================

  if (alertTriggered || totalScore >= 10) {
    fetch("/api/send-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        answers,
        totalScore,
        risk: color,
        timestamp: new Date().toLocaleString()
      })
    })
      .then(async response => {
        const responseText = await response.text();

        if (!response.ok) {
          console.error(
            "ALERT FAILED:",
            responseText
          );
        } else {
          console.log("ALERT SUCCESS");
        }
      })
      .catch(error => {
        console.error("ALERT FAILED:", error);
      });
  }
}

// =====================================================
// RESTART ASSESSMENT
// =====================================================

function restartAssessment() {
  document.getElementById("result").style.display = "none";
  document.getElementById("assessment").style.display = "none";
  document.getElementById("landing").style.display = "flex";

  window.scrollTo(0, 0);
}
