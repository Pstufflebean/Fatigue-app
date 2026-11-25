
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
let assessmentFinishing = false;
let assessmentSaved = false;
let assessmentLoading = false;
let submissionUnconfirmed = false;

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
// START ASSESSMENT
// =====================================================

async function startAssessment() {
  if (
    assessmentLoading ||
    assessmentFinishing ||
    submissionUnconfirmed
  ) {
    return;
  }

  assessmentLoading = true;

  current = 0;
  answers = [];
  totalScore = 0;
  questions = [];
  answerMap = {};
  assessmentFinishing = false;
  assessmentSaved = false;

  document.getElementById("landing").style.display = "none";
  document.getElementById("assessment").style.display = "flex";
  document.getElementById("result").style.display = "none";

  try {
    await loadQuestions();

    if (!questions.length) {
      throw new Error("No active questions found");
    }

    window.scrollTo(0, 0);
    showQuestion();

  } catch (error) {
    console.error("Unable to load assessment");

    alert(
      "Unable to load assessment questions. " +
      "Please check your connection and try again."
    );

    document.getElementById("assessment").style.display = "none";
    document.getElementById("landing").style.display = "flex";

  } finally {
    assessmentLoading = false;
  }
}

// =====================================================
// LOAD QUESTIONS
// =====================================================
// The browser retains read access to active questions.
// Assessment submissions are handled by the server API.

async function loadQuestions() {
  const { data, error } = await supabaseClient
    .from("questions")
    .select("*")
    .eq("active", true)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error("Error loading questions");
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
    console.error("Invalid question condition");
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

  // ===================================================
  // NUMERIC
  // ===================================================

  if (q.type === "numeric") {
    num.style.display = "block";

    const fatigueKey = getFatigueKey(q);

    num.min = "0";

    // Travel hours permit decimal values.
    // All other numeric answers require whole numbers.

    num.step = fatigueKey === "travel" ? "any" : "1";
  }

  // ===================================================
  // BOOLEAN
  // ===================================================

  if (q.type === "boolean") {
    sel.style.display = "block";

    sel.innerHTML =
      '<option value="">Select</option>' +
      '<option value="0">No</option>' +
      '<option value="1">Yes</option>';
  }

  // ===================================================
  // SELECT
  // ===================================================

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
      console.error("Invalid select options");
    }
  }

  // ===================================================
  // MULTISELECT
  // ===================================================

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
      console.error("Invalid multiselect options");
    }
  }

  // ===================================================
  // TEXT
  // ===================================================

  if (q.type === "text") {
    txt.style.display = "block";
  }
}

// =====================================================
// NEXT QUESTION
// =====================================================

function nextQuestion() {
  if (
    assessmentLoading ||
    assessmentFinishing ||
    assessmentSaved ||
    submissionUnconfirmed ||
    current >= questions.length
  ) {
    return;
  }

  const q = questions[current];

  let value;

  // ===================================================
  // COLLECT MULTISELECT ANSWER
  // ===================================================

  if (q.type === "multiselect") {
    value = Array.from(
      document.querySelectorAll(
        '#multiSelectInput input[type="checkbox"]:checked'
      ),
      el => Number(el.value)
    );

    if (
      value.some(
        selected => !Number.isFinite(selected)
      )
    ) {
      return alert("Select valid options.");
    }

  // ===================================================
  // COLLECT NUMERIC ANSWER
  // ===================================================

  } else if (q.type === "numeric") {
    const raw =
      document.getElementById("numericInput").value;

    if (raw.trim() === "") {
      return alert("Enter a number.");
    }

    value = Number(raw);

    if (!Number.isFinite(value)) {
      return alert("Enter a valid number.");
    }

  // ===================================================
  // COLLECT TEXT ANSWER
  // ===================================================

  } else if (q.type === "text") {
    value =
      document.getElementById("textInput").value.trim();

    if (!value) {
      return alert("Enter a response.");
    }

  // ===================================================
  // COLLECT BOOLEAN OR SELECT ANSWER
  // ===================================================

  } else {
    const raw =
      document.getElementById("selectInput").value;

    if (raw === "") {
      return alert("Select an option.");
    }

    value = Number(raw);

    if (!Number.isFinite(value)) {
      return alert("Select a valid option.");
    }
  }

  // ===================================================
  // NUMERIC QUESTION VALIDATION
  // ===================================================

  const fatigueKey = getFatigueKey(q);

  if (q.type === "numeric") {
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
  }

  // ===================================================
  // FATIGUE WORKLOAD VALIDATION
  // ===================================================

  if (fatigueKey) {
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

  // ===================================================
  // STORE FOR CONDITIONAL LOGIC
  // ===================================================

  answerMap[q.id] = value;

  // ===================================================
  // STORE ANSWER IN MEMORY
  // ===================================================
  // Send original values to the server.
  // The server calculates all weighted scores.
  //
  // Numeric answers remain numbers.
  // Text answers remain strings.
  // Multiselect answers remain arrays.

  answers.push({
    question_id: q.id,
    value: value
  });

  current++;
  showQuestion();
}

// =====================================================
// SUBMISSION DISPLAY
// =====================================================

function showSubmissionStatus(message) {
  document.getElementById("landing").style.display = "none";
  document.getElementById("assessment").style.display = "none";
  document.getElementById("result").style.display = "flex";

  document.getElementById("resultColor").innerText =
    message;

  window.scrollTo(0, 0);
}

// =====================================================
// VALIDATE SERVER RESPONSE
// =====================================================

function validSubmissionResponse(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (data.saved !== true) {
    return false;
  }

  if (
    typeof data.assessment_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(data.assessment_id)
  ) {
    return false;
  }

  if (
    data.total_score === null ||
    data.total_score === undefined ||
    data.total_score === "" ||
    !Number.isFinite(Number(data.total_score))
  ) {
    return false;
  }

  if (
    !["GREEN", "YELLOW", "ORANGE", "RED"]
      .includes(data.risk_color)
  ) {
    return false;
  }

  return true;
}

// =====================================================
// FINISH ASSESSMENT
// =====================================================
// All scoring, assessment storage, global data storage,
// and email notification processing occur on the server.

async function finishAssessment() {
  if (
    assessmentFinishing ||
    assessmentSaved ||
    submissionUnconfirmed
  ) {
    return;
  }

  assessmentFinishing = true;

  showSubmissionStatus(
    "Submitting assessment. Please wait..."
  );

  // ===================================================
  // SUBMIT TO SERVER API
  // ===================================================

  let result;

  try {
    const response = await fetch(
      "/api/submit-assessment",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        cache: "no-store",
        body: JSON.stringify({
          answers: answers.map(answer => ({
            question_id: answer.question_id,
            value: answer.value
          }))
        })
      }
    );

    // =================================================
    // HANDLE CONFIRMED VALIDATION REJECTION
    // =================================================

    if (response.status === 400) {
      showSubmissionStatus(
        "Assessment could not be submitted."
      );

      alert(
        "The assessment was rejected during validation. " +
        "Please restart the assessment and check your answers."
      );

      return;
    }

    // =================================================
    // HANDLE OTHER SERVER ERRORS
    // =================================================

    if (!response.ok) {
      throw new Error(
        "Assessment confirmation unavailable"
      );
    }

    result = await response.json();

    // =================================================
    // VALIDATE SAVE CONFIRMATION
    // =================================================

    if (!validSubmissionResponse(result)) {
      throw new Error(
        "Invalid assessment confirmation"
      );
    }

  } catch (error) {
    // The assessment may have been saved even if
    // the browser did not receive confirmation.
    // Do not automatically submit again.

    submissionUnconfirmed = true;

    console.error(
      "Assessment submission could not be confirmed"
    );

    showSubmissionStatus(
      "Assessment submission could not be confirmed."
    );

    alert(
      "The server did not confirm your assessment. " +
      "It may already have been saved. " +
      "Please notify your supervisor before submitting again."
    );

    return;

  } finally {
    assessmentFinishing = false;
  }

  // ===================================================
  // CONFIRM SUCCESSFUL ASSESSMENT
  // ===================================================

  assessmentSaved = true;

  // Server-calculated score and risk are authoritative.

  totalScore = Number(result.total_score);

  const color = result.risk_color;

  console.log(
    "Assessment saved successfully"
  );

  console.log(
    "Assessment ID:",
    result.assessment_id
  );

  console.log(
    "Final assessment score:",
    totalScore
  );

  console.log(
    "Risk classification:",
    color
  );

  console.log(
    "Alert status:",
    result.alert_status
  );

  // Remove submitted answers from browser memory.

  answers = [];
  answerMap = {};

  // Clear potentially identifying text input.

  document.getElementById("textInput").value = "";

  // ===================================================
  // DISPLAY CONFIRMED RESULT
  // ===================================================

  showSubmissionStatus(
    "Risk Level: " + color
  );

  // ===================================================
  // NOTIFICATION STATUS
  // ===================================================
  // Emails are sent exclusively by the server.
  // The browser must never attempt to send them again.
  //
  // sent:
  // All emails accepted by Resend.
  //
  // partial:
  // Some emails accepted, others failed.
  //
  // failed:
  // Notification processing failed.
  //
  // not_required:
  // No notification was triggered.

  if (
    result.alert_status !== "sent" &&
    result.alert_status !== "not_required"
  ) {
    console.warn(
      "Assessment saved, but alert processing " +
      "was not fully successful."
    );

    alert(
      "Your assessment was saved successfully. " +
      "However, one or more notifications could not " +
      "be confirmed. Please notify your supervisor."
    );
  }
}

// =====================================================
// RESTART ASSESSMENT
// =====================================================

function restartAssessment() {
  // Prevent restarting during an active submission.

  if (
    assessmentFinishing ||
    assessmentLoading
  ) {
    return;
  }

  // Prevent accidental duplicate assessments when
  // the previous submission could not be confirmed.

  if (submissionUnconfirmed) {
    alert(
      "Your previous submission could not be confirmed. " +
      "Please notify your supervisor before starting " +
      "another assessment."
    );

    return;
  }

  current = 0;
  questions = [];
  answers = [];
  answerMap = {};
  totalScore = 0;
  assessmentSaved = false;
  assessmentFinishing = false;

  document.getElementById("numericInput").value = "";
  document.getElementById("selectInput").value = "";
  document.getElementById("textInput").value = "";

  document
    .getElementById("multiSelectInput")
    .replaceChildren();

  document.getElementById("result").style.display = "none";
  document.getElementById("assessment").style.display = "none";
  document.getElementById("landing").style.display = "flex";

  window.scrollTo(0, 0);
}
