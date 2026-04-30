// Initialize Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// App State
let questions = [];
let current = 0;
let answers = [];
let totalScore = 0;
let answerMap = {};
let alertTriggered = false; // 🔥 track alerts

// =======================
// START ASSESSMENT
// =======================
async function startAssessment() {

  current = 0;
  answers = [];
  totalScore = 0;
  questions = [];
  answerMap = {};
  alertTriggered = false;

  document.getElementById('landing').style.display = 'none';
  document.getElementById('assessment').style.display = 'block';
  document.getElementById('result').style.display = 'none';

  await loadQuestions();

  if (!questions || questions.length === 0) {
    alert("No questions found");
    return;
  }

  showQuestion();
}

// =======================
// LOAD QUESTIONS
// =======================
async function loadQuestions() {
  try {
    const { data, error } = await supabaseClient
      .from('questions')
      .select('*')
      .eq('active', true)
      .order('order_index', { ascending: true });

    if (error) {
      console.error(error);
      alert("Error loading questions");
      return;
    }

    questions = data;

  } catch (err) {
    console.error(err);
    alert("App crashed loading questions");
  }
}

// =======================
// CONDITIONAL LOGIC (FIXED)
// =======================
function shouldShowQuestion(q) {
  if (!q.condition) return true;

  try {
    const cond = typeof q.condition === "string"
      ? JSON.parse(q.condition)
      : q.condition;

    const prevValue = answerMap[cond.question_id];

    if (prevValue === undefined) return false;

    const val = Number(prevValue);

    if (cond.equals !== undefined) {
      return val === Number(cond.equals);
    }

    if (cond.min !== undefined) {
      return val >= Number(cond.min);
    }

    if (cond.max !== undefined) {
      return val <= Number(cond.max);
    }

  } catch (err) {
    console.error("Condition error:", err);
  }

  return false;
}

// =======================
// SHOW QUESTION
// =======================
function showQuestion() {

  while (current < questions.length && !shouldShowQuestion(questions[current])) {
    current++;
  }

  if (current >= questions.length) {
    finishAssessment();
    return;
  }

  const q = questions[current];

  document.getElementById('questionText').innerText = q.text;

  const numericInput = document.getElementById('numericInput');
  const selectInput = document.getElementById('selectInput');
  const textInput = document.getElementById('textInput');

  numericInput.style.display = 'none';
  selectInput.style.display = 'none';
  textInput.style.display = 'none';

  numericInput.value = '';
  selectInput.innerHTML = '<option value="">Select</option>';
  textInput.value = '';

  if (q.type === 'numeric') {
    numericInput.style.display = 'block';

  } else if (q.type === 'boolean') {
    selectInput.style.display = 'block';
    selectInput.innerHTML += `
      <option value="0">No</option>
      <option value="1">Yes</option>
    `;

  } else if (q.type === 'select') {
    selectInput.style.display = 'block';

    try {
      const options = JSON.parse(q.options);
      options.forEach(opt => {
        selectInput.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
      });
    } catch (err) {
      console.error("Options error:", err);
    }

  } else if (q.type === 'text') {
    textInput.style.display = 'block';
  }
}

// =======================
// NEXT QUESTION
// =======================
function nextQuestion() {

  const q = questions[current];
  let value;

  // INPUT HANDLING
  if (q.type === 'numeric') {
    const raw = document.getElementById('numericInput').value;

    if (!raw || raw.trim() === "") {
      alert("Please enter a number");
      return;
    }

    value = Number(raw);

    if (isNaN(value)) {
      alert("Please enter a valid number");
      return;
    }

  } else if (q.type === 'text') {
    const raw = document.getElementById('textInput').value;

    if (!raw || raw.trim() === "") {
      alert("Please enter a response");
      return;
    }

    value = raw.trim();

  } else {
    const raw = document.getElementById('selectInput').value;

    if (raw === "") {
      alert("Please select an option");
      return;
    }

    value = Number(raw);
  }

  // Save for conditional logic
  answerMap[q.id] = value;

  // 🚨 ALERT TRACKING (no email yet)
  if (
    q.alert_trigger === true &&
    q.type === 'boolean' &&
    Number(value) === 1
  ) {
    alertTriggered = true;
  }

  // =======================
  // SCORING
  // =======================
  let weighted = 0;

  if (q.type !== 'text') {
    if (q.scoring) {
      try {
        const rules = typeof q.scoring === "string"
          ? JSON.parse(q.scoring)
          : q.scoring;

        for (let rule of rules) {
          if (rule.min !== undefined && value >= rule.min && value <= rule.max) {
            weighted = rule.score;
            break;
          }

          if (rule.value !== undefined && value === rule.value) {
            weighted = rule.score;
            break;
          }
        }

      } catch (err) {
        console.error("Scoring error:", err);
      }

    } else {
      weighted = value * q.weight;
    }
  }

  totalScore += weighted;

  // Save answer
  answers.push({
    question_id: q.id,
    value: String(value),
    weighted_score: weighted
  });

  current++;
  showQuestion();
}

// =======================
// SCORE → COLOR
// =======================
function getColor(score) {
  if (score <= 3) return "GREEN";
  if (score <= 6) return "YELLOW";
  if (score <= 9) return "ORANGE";
  return "RED";
}

// =======================
// FINISH
// =======================
async function finishAssessment() {

  const color = getColor(totalScore);

  document.getElementById('assessment').style.display = 'none';
  document.getElementById('result').style.display = 'block';

  document.getElementById('resultColor').innerText = "Risk Level: " + color;

  // Save assessment
  const { data: assessment, error } = await supabaseClient
    .from('assessments')
    .insert([{
      total_score: totalScore,
      risk_color: color
    }])
    .select();

  if (error) {
    console.error(error);
    alert("Error saving assessment");
    return;
  }

  const assessmentId = assessment[0].id;

  // Save answers
  for (let a of answers) {

    const { error } = await supabaseClient
      .from('answers')
      .insert([{
        assessment_id: assessmentId,
        question_id: a.question_id,
        value: a.value,
        weighted_score: a.weighted_score
      }]);

    if (error) {
      console.error("Answer insert failed:", error);
    }
  }

  // 🚨 SEND FULL ALERT EMAIL
 if (alertTriggered) {

  fetch('/api/send-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      answers: answers,
      totalScore: totalScore,
      risk: color,
      timestamp: new Date().toLocaleString()
    })
  })
  .then(async res => {
    const text = await res.text();

    if (!res.ok) {
      console.error("ALERT FAILED:", text);
    } else {
      console.log("ALERT SUCCESS:", text);
    }
  })
  .catch(err => console.error("FETCH ERROR:", err));
}

// =======================
// RESTART
// =======================
function restartAssessment() {
  document.getElementById('result').style.display = 'none';
  document.getElementById('assessment').style.display = 'none';
  document.getElementById('landing').style.display = 'block';
}