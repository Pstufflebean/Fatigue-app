const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let questions = [];
let current = 0;
let answers = [];
let totalScore = 0;

async function startAssessment() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('assessment').style.display = 'block';

  await loadQuestions();
  showQuestion();
}

async function loadQuestions() {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('active', true)
    .order('order_index');

  if (error) {
    console.error(error);
    alert("Error loading questions");
    return;
  }

  questions = data;
}

function showQuestion() {
  const q = questions[current];

  document.getElementById('questionText').innerText = q.text;

  if (q.type === 'numeric') {
    document.getElementById('numericInput').style.display = 'block';
    document.getElementById('selectInput').style.display = 'none';
  } else {
    document.getElementById('numericInput').style.display = 'none';
    document.getElementById('selectInput').style.display = 'block';
  }
}

function nextQuestion() {
  const q = questions[current];
  let value;

  if (q.type === 'numeric') {
    value = Number(document.getElementById('numericInput').value);
  } else {
    value = Number(document.getElementById('selectInput').value);
  }

  let weighted = value * q.weight;
  totalScore += weighted;

  answers.push({
    question_id: q.id,
    value: value,
    weighted_score: weighted
  });

  document.getElementById('numericInput').value = '';
  document.getElementById('selectInput').value = '';

  current++;

  if (current < questions.length) {
    showQuestion();
  } else {
    finishAssessment();
  }
}

function getColor(score) {
  if (score <= 3) return "GREEN";
  if (score <= 6) return "YELLOW";
  if (score <= 9) return "ORANGE";
  return "RED";
}

async function finishAssessment() {
  const color = getColor(totalScore);

  document.getElementById('assessment').style.display = 'none';
  document.getElementById('result').style.display = 'block';

  document.getElementById('resultColor').innerText = color;
  document.getElementById('resultScore').innerText = "Score: " + totalScore;

  const { data: assessment, error } = await supabase
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

  for (let a of answers) {
    await supabase.from('answers').insert([{
      assessment_id: assessmentId,
      question_id: a.question_id,
      value: a.value,
      weighted_score: a.weighted_score
    }]);
  }

  if (totalScore >= 10) {
    console.log("Trigger supervisor alert");
  }
}