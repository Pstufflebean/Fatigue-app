
 // Initialize Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// App State
let questions = [];
let current = 0;
let answers = [];
let totalScore = 0;
let answerMap = {};
let alertTriggered = false;
let assessmentFinishing = false;

// =====================================================
// FATIGUE UNIT QUESTIONS
// Question text must match Supabase exactly
// =====================================================

const FATIGUE_QUESTIONS = {
  calls: "How many calls have you responded to during your current shift?",
  transports: "How many of those calls resulted in a patient transport?",
  overnight: "How many of those calls occurred overnight (2200–0600)?",
  travel: "How many total hours have you spent driving or riding as a passenger during your current shift?"
};

function getFatigueQuestion(key) {
  return questions.find(
    q => q.text.trim() === FATIGUE_QUESTIONS[key]
  );
}

function getFatigueAnswer(key) {
  const question = getFatigueQuestion(key);

  if (!question || answerMap[question.id] === undefined) {
    return 0;
  }

  return Number(answerMap[question.id]) || 0;
}

// Calculate fatigue units and assessment points
function calculateFatigueScore() {
  const calls = getFatigueAnswer('calls');

  if (calls === 0) {
    return {
      fatigueUnits: 0,
      fatiguePoints: 0
    };
  }

  const transports = getFatigueAnswer('transports');
  const overnight = getFatigueAnswer('overnight');

  // Round travel hours to the nearest whole hour
  const roundedTravelHours = Math.floor(
    getFatigueAnswer('travel') + 0.5
  );

  // Maximum of 15 fatigue units
  const fatigueUnits = Math.min(
    15,
    calls + transports + overnight + roundedTravelHours
  );

  // Each fatigue unit = 0.4 assessment points
  // Maximum contribution = 6 points
  return {
    fatigueUnits,
    fatiguePoints: Number(
      (fatigueUnits * 0.4).toFixed(2)
    )
  };
}

// =====================================================
// CIRCADIAN SCORING
// =====================================================

function getCircadianScore() {
  const now = new Date();
  const hour = now.getHours();

  // HIGH RISK: 0200–0559
  if (hour >= 2 && hour < 6) {
    return 2;
  }

  // MODERATE RISK: 0000–0159 and 0600–0759
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

  document.getElementById('landing').style.display = 'none';
  document.getElementById('assessment').style.display = 'flex';
  document.getElementById('result').style.display = 'none';

  await loadQuestions();

  if (!questions.length) {
    alert(
      'No questions found. Please check the connection and try again.'
    );

    document.getElementById('assessment').style.display = 'none';
    document.getElementById('landing').style.display = 'flex';

    return;
  }

  window.scrollTo(0, 0);
  showQuestion();
}

// =====================================================
// LOAD QUESTIONS FROM SUPABASE
// =====================================================

async function loadQuestions() {
  const { data, error } = await supabaseClient
    .from('questions')
    .select('*')
    .eq('active', true)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error loading questions:', error);
    alert('Error loading questions');
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
    // Support both JSON strings and JSON objects
    const cond = typeof q.condition === 'string'
      ? JSON.parse(q.condition)
      : q.condition;

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
    console.error(
      'Invalid question condition:',
      error,
      q
    );

    return false;
  }
}

// =====================================================
// DISPLAY QUESTION
// =====================================================

function showQuestion() {
  // Skip questions whose conditions are not met
  while (
    current < questions.length &&
    !shouldShowQuestion(questions[current])
  ) {
    current++;
  }

  // End assessment when all applicable questions are complete
  if (current >= questions.length) {
    finishAssessment();
    return;
  }

  const q = questions[current];

  document.getElementById('questionText').innerText = q.text;

  const num = document.getElementById('numericInput');
  const sel = document.getElementById('selectInput');
  const txt = document.getElementById('textInput');
  const multi = document.getElementById('multiSelectInput');

  // Hide all input types
  num.style.display = 'none';
  sel.style.display = 'none';
  txt.style.display = 'none';
  multi.style.display = 'none';

  // Reset inputs
  num.value = '';
  num.removeAttribute('step');
  num.removeAttribute('min');

  sel.innerHTML = '<option value="">Select</option>';
  txt.value = '';
  multi.replaceChildren();

  // ---------------------------------------------------
  // NUMERIC
  // ---------------------------------------------------

  if (q.type === 'numeric') {
    num.style.display = 'block';

    // Identify fatigue questions
    const fatigueKey = Object.keys(FATIGUE_QUESTIONS).find(
      key => FATIGUE_QUESTIONS[key] === q.text.trim()
    );

    if (fatigueKey) {
      num.min = '0';

      // Travel hours can be decimal
      // Other fatigue responses must be whole numbers
      num.step = fatigueKey === 'travel'
        ? 'any'
        : '1';
    }
  }

  // ---------------------------------------------------
  // BOOLEAN
  // ---------------------------------------------------

  if (q.type === 'boolean') {
    sel.style.display = 'block';

    sel.innerHTML +=
      '<option value="0">No</option><option value="1">Yes</option>';
  }

  // ---------------------------------------------------
  // SINGLE SELECT
  // ---------------------------------------------------

  if (q.type === 'select') {
    sel.style.display = 'block';

    try {
      const opts = typeof q.options === 'string'
        ? JSON.parse(q.options)
        : q.options;

      (opts || []).forEach(o => {
        const option = document.createElement('option');

        option.value = o.value;
        option.textContent = o.label;

        sel.appendChild(option);
      });

    } catch (error) {
      console.error('Invalid select options:', error);
    }
  }

  // ---------------------------------------------------
  // MULTISELECT
  // ---------------------------------------------------

  if (q.type === 'multiselect') {
    multi.style.display = 'flex';

    try {
      const opts = typeof q.options === 'string'
        ? JSON.parse(q.options)
        : q.options;

      (opts || []).forEach(o => {
        const label = document.createElement('label');

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

        const checkbox = document.createElement('input');

        checkbox.type = 'checkbox';
        checkbox.value = String(o.value);

        checkbox.style.cssText = `
          width: 20px;
          height: 20px;
          max-width: none;
          margin: 0;
          flex: 0 0 auto;
        `;

        const labelText = document.createElement('span');
        labelText.textContent = o.label;

        label.append(checkbox, labelText);
        multi.appendChild(label);
      });

    } catch (error) {
      console.error('Invalid multiselect options:', error);
    }
  }

  // ---------------------------------------------------
  // TEXT
  // ---------------------------------------------------

  if (q.type === 'text') {
    txt.style.display = 'block';
  }
}

// =====================================================
// NEXT QUESTION
// =====================================================

function nextQuestion() {
  if (assessmentFinishing || current >= questions.length) {
    return;
  }

  const q = questions[current];
  let value;

  // ---------------------------------------------------
  // COLLECT RESPONSE
  // ---------------------------------------------------

  if (q.type === 'multiselect') {
    value = Array.from(
      document.querySelectorAll(
        '#multiSelectInput input[type="checkbox"]:checked'
      ),
      el => Number(el.value)
    );

  } else if (q.type === 'numeric') {
    const raw = document.getElementById('numericInput').value;

    if (raw.trim() === '') {
      return alert('Enter a number');
    }

    value = Number(raw);

    if (!Number.isFinite(value)) {
      return alert('Enter a valid number');
    }

  } else if (q.type === 'text') {
    value = document.getElementById('textInput').value.trim();

    if (!value) {
      return alert('Enter a response');
    }

  } else {
    const raw = document.getElementById('selectInput').value;

    if (raw === '') {
      return alert('Select an option');
    }

    value = Number(raw);
  }

  // ---------------------------------------------------
  // FATIGUE QUESTION VALIDATION
  // ---------------------------------------------------

  const fatigueKey = Object.keys(FATIGUE_QUESTIONS).find(
    key => FATIGUE_QUESTIONS[key] === q.text.trim()
  );

  if (fatigueKey) {
    // No negative values
    if (!Number.isFinite(value) || value < 0) {
      return alert(
        'Enter a valid number of zero or greater.'
      );
    }

    // Calls, transports, and overnight calls
    // must be whole numbers
    if (
      fatigueKey !== 'travel' &&
      !Number.isInteger(value)
    ) {
      return alert('Enter a whole number.');
    }

    // Transport and overnight counts cannot
    // exceed total calls
    if (
      (
        fatigueKey === 'transports' ||
        fatigueKey === 'overnight'
      ) &&
      value > getFatigueAnswer('calls')
    ) {
      return alert(
        'This cannot exceed the total number of calls.'
      );
    }
  }

  // Store response for conditional questions
  answerMap[q.id] = value;

  // ---------------------------------------------------
  // ALERT TRACKING
  // ---------------------------------------------------

  if (q.alert_trigger) {
    if (Array.isArray(value)) {
      if (value.includes(1)) {
        alertTriggered = true;
      }

    } else if (Number(value) === 1) {
      alertTriggered = true;
    }
  }

  // ---------------------------------------------------
  // STANDARD QUESTION SCORING
  // Fatigue questions are scored separately at finish
  // ---------------------------------------------------

  let score = 0;

  if (
    !fatigueKey &&
    q.scoring &&
    q.type !== 'text'
  ) {
    try {
      const rules = typeof q.scoring === 'string'
        ? JSON.parse(q.scoring)
        : q.scoring;

      if (q.type === 'multiselect') {
        // Add score for every selected option
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
        // Numeric, boolean, and single-select scoring
        for (const rule of (rules || [])) {
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
      console.error('Scoring error:', error);
    }
  }

  totalScore += score;

  // ---------------------------------------------------
  // STORE INDIVIDUAL ANSWER
  // ---------------------------------------------------

  answers.push({
    question_id: q.id,

    value: Array.isArray(value)
      ? JSON.stringify(value)
      : String(value),

    weighted_score: score
  });

  // Advance to next applicable question
  current++;
  showQuestion();
}

// =====================================================
// RISK LEVEL
// =====================================================

function getColor(score) {
  if (score < 4) {
    return 'GREEN';
  }

  if (score < 7) {
    return 'YELLOW';
  }

  if (score < 10) {
    return 'ORANGE';
  }

  return 'RED';
}

// =====================================================
// FINISH ASSESSMENT
// =====================================================

async function finishAssessment() {
  // Prevent duplicate submissions
  if (assessmentFinishing) {
    return;
  }

  assessmentFinishing = true;

  // ---------------------------------------------------
  // APPLY COMBINED FATIGUE SCORE
  // ---------------------------------------------------

  const fatigue = calculateFatigueScore();

  totalScore += fatigue.fatiguePoints;

  // Attribute combined score to the first fatigue
  // question while retaining all four individual answers
  const callsQuestion = getFatigueQuestion('calls');

  if (callsQuestion) {
    const callsAnswer = answers.find(
      a => a.question_id === callsQuestion.id
    );

    if (callsAnswer) {
      callsAnswer.weighted_score = fatigue.fatiguePoints;
    }
  }

  // ---------------------------------------------------
  // APPLY CIRCADIAN SCORE
  // ---------------------------------------------------

  const circadianScore = getCircadianScore();

  totalScore += circadianScore;

  // Avoid floating-point artifacts
  totalScore = Number(totalScore.toFixed(2));

  console.log('Fatigue units:', fatigue.fatigueUnits);
  console.log('Fatigue points:', fatigue.fatiguePoints);
  console.log('Circadian score applied:', circadianScore);

  // ---------------------------------------------------
  // CALCULATE RISK LEVEL
  // ---------------------------------------------------

  const color = getColor(totalScore);

  document.getElementById('landing').style.display = 'none';
  document.getElementById('assessment').style.display = 'none';
  document.getElementById('result').style.display = 'flex';

  document.getElementById('resultColor').innerText =
    'Risk Level: ' + color;

  window.scrollTo(0, 0);

  // ---------------------------------------------------
  // SAVE ASSESSMENT TO SUPABASE
  // ---------------------------------------------------

  try {
    const { data, error } = await supabaseClient
      .from('assessments')
      .insert([{
        total_score: totalScore,
        risk_color: color
      }])
      .select();

    if (error) {
      throw error;
    }

    if (!data || !data.length) {
      throw new Error('No assessment ID returned');
    }

    const id = data[0].id;

    // Save each answer
    for (const answer of answers) {
      const { error: answerError } = await supabaseClient
        .from('answers')
        .insert([{
          assessment_id: id,
          question_id: answer.question_id,
          value: answer.value,
          weighted_score: answer.weighted_score
        }]);

      if (answerError) {
        throw answerError;
      }
    }

    console.log(
      'Assessment and answers saved successfully'
    );

  } catch (error) {
    console.error('Assessment save failed:', error);

    alert(
      'Your risk level was calculated, but the assessment ' +
      'could not be fully saved. Please notify your supervisor.'
    );
  }

  // ---------------------------------------------------
  // EMAIL ALERTS
  // ---------------------------------------------------

  // Trigger for:
  // 1. A question with an activated alert trigger
  // 2. Total assessment score of 10 or greater

  if (alertTriggered || totalScore >= 10) {
    fetch('/api/send-alert', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
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
            'ALERT FAILED:',
            responseText
          );
        } else {
          console.log('ALERT SUCCESS');
        }
      })
      .catch(error => {
        console.error('ALERT FAILED:', error);
      });
  }
}

// =====================================================
// RESTART ASSESSMENT
// =====================================================

function restartAssessment() {
  document.getElementById('result').style.display = 'none';
  document.getElementById('assessment').style.display = 'none';
  document.getElementById('landing').style.display = 'flex';

  window.scrollTo(0, 0);
}
