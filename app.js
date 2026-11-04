// Initialize Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// App State
let questions = [];
let current = 0;
let answers = [];
let totalScore = 0;
let answerMap = {};
let alertTriggered = false;

// =======================
// 🔥 CIRCadian FUNCTION (GLOBAL)
// =======================
function getCircadianScore() {
  const now = new Date();
  const hour = now.getHours(); // 0–23

  // HIGH RISK: 0200–0559
  if (hour >= 2 && hour < 6) {
    return 2;
  }

  // MODERATE RISK: 0000–0159 and 0600–0759
  if ((hour >= 0 && hour < 2) || (hour >= 6 && hour < 8)) {
    return 1;
  }

  return 0;
}

// START
async function startAssessment() {

  current = 0;
  answers = [];
  totalScore = 0;
  questions = [];
  answerMap = {};
  alertTriggered = false;

  // Show assessment only
  document.getElementById('landing').style.display = 'none';
  document.getElementById('assessment').style.display = 'flex';
  document.getElementById('result').style.display = 'none';

  await loadQuestions();

  if (!questions || questions.length === 0) {
    alert("No questions found");

    // Return to landing if questions cannot load
    document.getElementById('assessment').style.display = 'none';
    document.getElementById('landing').style.display = 'flex';
    return;
  }

  window.scrollTo(0, 0);
  showQuestion();
}

// LOAD QUESTIONS
async function loadQuestions() {
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
}

// CONDITIONAL
function shouldShowQuestion(q) {
  if (!q.condition) return true;

  try {
    const cond = JSON.parse(q.condition);
    const prev = answerMap[cond.question_id];

    if (prev === undefined) return false;

    if (cond.equals !== undefined) return Number(prev) === Number(cond.equals);
    if (cond.min !== undefined) return Number(prev) >= cond.min;
    if (cond.max !== undefined) return Number(prev) <= cond.max;

  } catch (e) {
    console.error(e);
  }

  return false;
}

// SHOW
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

  const num = document.getElementById('numericInput');
  const sel = document.getElementById('selectInput');
  const txt = document.getElementById('textInput');

  num.style.display = 'none';
  sel.style.display = 'none';
  txt.style.display = 'none';

  num.value = '';
  sel.innerHTML = '<option value="">Select</option>';
  txt.value = '';

  if (q.type === 'numeric') {
    num.style.display = 'block';
  }

  if (q.type === 'boolean') {
    sel.style.display = 'block';
    sel.innerHTML += `<option value="0">No</option><option value="1">Yes</option>`;
  }

  if (q.type === 'select') {
    sel.style.display = 'block';
    try {
      const opts = JSON.parse(q.options);
      opts.forEach(o => {
        sel.innerHTML += `<option value="${o.value}">${o.label}</option>`;
      });
    } catch (e) {
      console.error(e);
    }
  }

  if (q.type === 'text') {
    txt.style.display = 'block';
  }
}

// NEXT
function nextQuestion() {

  const q = questions[current];
  let value;

  if (q.type === 'numeric') {
    const raw = document.getElementById('numericInput').value;
    if (!raw) return alert("Enter a number");
    value = Number(raw);
  }

  else if (q.type === 'text') {
    const raw = document.getElementById('textInput').value;
    if (!raw) return alert("Enter a response");
    value = raw.trim();
  }

  else {
    const raw = document.getElementById('selectInput').value;
    if (!raw) return alert("Select an option");
    value = Number(raw);
  }

  answerMap[q.id] = value;

  // ALERT TRACK
  if (q.alert_trigger && Number(value) === 1) {
    alertTriggered = true;
  }

  let score = 0;

  if (q.scoring && q.type !== 'text') {
    try {
      const rules = JSON.parse(q.scoring);
      for (let r of rules) {
        if (r.min !== undefined && value >= r.min && value <= r.max) score = r.score;
        if (r.value !== undefined && value === r.value) score = r.score;
      }
    } catch {}
  }

  totalScore += score;

  answers.push({
    question_id: q.id,
    value: String(value),
    weighted_score: score
  });

  current++;
  showQuestion();
}

// COLOR
function getColor(score) {
  if (score <= 3) return "GREEN";
  if (score <= 6) return "YELLOW";
  if (score <= 9) return "ORANGE";
  return "RED";
}

// FINISH
async function finishAssessment() {

  // 🔥 APPLY CIRCADIAN HERE (CORRECT PLACE)
  const circadianScore = getCircadianScore();
  totalScore += circadianScore;

  console.log("Circadian score applied:", circadianScore);

  const color = getColor(totalScore);

document.getElementById('landing').style.display = 'none';
document.getElementById('assessment').style.display = 'none';
document.getElementById('result').style.display = 'flex';

window.scrollTo(0, 0);

  document.getElementById('resultColor').innerText = "Risk Level: " + color;

  const { data } = await supabaseClient
    .from('assessments')
    .insert([{ total_score: totalScore, risk_color: color }])
    .select();

  const id = data[0].id;

  for (let a of answers) {
    await supabaseClient.from('answers').insert([{
      assessment_id: id,
      question_id: a.question_id,
      value: a.value,
      weighted_score: a.weighted_score
    }]);
  }

  // EMAIL TRIGGER
  if (alertTriggered || totalScore >= 10) {
    fetch('/api/send-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers,
        totalScore,
        risk: color,
        timestamp: new Date().toLocaleString()
      })
    })
    .then(async res => {
      const text = await res.text();
      if (!res.ok) console.error("ALERT FAILED:", text);
      else console.log("ALERT SUCCESS");
    });
  }
}

// RESTART
function restartAssessment() {

  document.getElementById('result').style.display = 'none';
  document.getElementById('assessment').style.display = 'none';
  document.getElementById('landing').style.display = 'flex';

  window.scrollTo(0, 0);
}