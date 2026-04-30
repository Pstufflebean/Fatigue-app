// Init Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_PASSWORD = "changeme123";

// LOGIN
function login() {
  const entered = document.getElementById('passwordInput').value;

  if (entered === ADMIN_PASSWORD) {
    document.getElementById('login').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    loadAssessments();
  } else {
    alert("Incorrect password");
  }
}

// LOAD ASSESSMENTS
async function loadAssessments() {

  const { data: assessments, error } = await supabaseClient
    .from('assessments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    alert("Error loading assessments");
    return;
  }

  const container = document.getElementById('assessmentList');
  container.innerHTML = "";

  for (let a of assessments) {

    const { data: answers } = await supabaseClient
      .from('answers')
      .select(`
        value,
        weighted_score,
        questions ( text, type, options )
      `)
      .eq('assessment_id', a.id);

    const formattedDate = new Date(a.created_at).toLocaleString();

    let answerHTML = "";

    answers.forEach(ans => {

      let displayValue = ans.value;

      // BOOLEAN FIX
      if (ans.questions.type === "boolean") {
        displayValue = ans.value == 1 ? "Yes" : "No";
      }

      // SELECT FIX
      if (ans.questions.type === "select" && ans.questions.options) {
        try {
          const opts = JSON.parse(ans.questions.options);
          const match = opts.find(o => Number(o.value) === Number(ans.value));
          if (match) displayValue = match.label;
        } catch (err) {
          console.error("Option parse error", err);
        }
      }

      // TEXT (leave as-is)

      answerHTML += `
        <div style="margin-bottom:10px;">
          <strong>${ans.questions.text}</strong><br>
          ${displayValue}
        </div>
      `;
    });

    // COLLAPSIBLE BLOCK
    const block = document.createElement("div");
    block.style.border = "1px solid #ccc";
    block.style.marginBottom = "10px";
    block.style.borderRadius = "6px";

    block.innerHTML = `
      <div style="padding:10px; cursor:pointer; background:#f4f6f8;" onclick="toggleDetails(this)">
        <strong>${formattedDate}</strong> |
        Score: ${a.total_score} |
        Risk: ${a.risk_color}
      </div>

      <div style="display:none; padding:15px;">
        ${answerHTML}
      </div>
    `;

    container.appendChild(block);
  }
}

// TOGGLE FUNCTION
function toggleDetails(header) {
  const details = header.nextElementSibling;

  if (details.style.display === "none") {
    details.style.display = "block";
  } else {
    details.style.display = "none";
  }
}