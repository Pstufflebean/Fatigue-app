import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {

  const { answers, totalScore, risk, timestamp } = req.body;

  try {

    let answerList = "";

    answers.forEach(a => {

      let displayValue = a.value;

      // BOOLEAN
      if (a.type === "boolean") {
        displayValue = Number(a.value) === 1 ? "Yes" : "No";
      }

      // SELECT
      if (a.type === "select" && a.options) {
        try {
          const opts = JSON.parse(a.options);
          const match = opts.find(o => Number(o.value) === Number(a.value));
          if (match) displayValue = match.label;
        } catch (err) {
          console.error("Option parse error", err);
        }
      }

      // TEXT + NUMERIC = already fine

      answerList += `
        <div style="margin-bottom:12px;">
          <strong>${a.text}</strong><br>
          ${displayValue}
        </div>
      `;
    });

    await resend.emails.send({
      from: 'Fatigue App <onboarding@resend.dev>',
      to: ['dshift@lcadems.com'], // 🔥 change this
      subject: '⚠️ Fatigue Alert - Full Assessment',
      html: `
        <h2>Fatigue Alert Triggered</h2>

        <p><strong>Time:</strong> ${timestamp}</p>
        <p><strong>Score:</strong> ${totalScore}</p>
        <p><strong>Risk Level:</strong> ${risk}</p>

        <hr>

        <h3>Assessment Responses</h3>
        ${answerList}
      `
    });

    res.status(200).json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Email failed' });
  }
}