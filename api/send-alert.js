import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {

  try {

    const { answers, totalScore, risk, timestamp } = req.body;

    let answerList = "";

    answers.forEach(a => {

      let displayValue = a.value;

      // BOOLEAN
      if (a.type === "boolean") {
        displayValue = Number(a.value) === 1 ? "Yes" : "No";
      }

      // SELECT (SAFE PARSE)
      if (a.type === "select" && a.options) {
        try {
          let opts = a.options;

          // 🔥 handle string OR object
          if (typeof opts === "string") {
            opts = JSON.parse(opts);
          }

          if (Array.isArray(opts)) {
            const match = opts.find(o => Number(o.value) === Number(a.value));
            if (match) displayValue = match.label;
          }

        } catch (err) {
          console.error("Options parse failed:", err);
        }
      }

      answerList += `
        <div style="margin-bottom:12px;">
          <strong>${a.text}</strong><br>
          ${displayValue}
        </div>
      `;
    });

    await resend.emails.send({
      from: 'Fatigue App <onboarding@resend.dev>',
      to: ['your@email.com'], // 🔥 replace or wire dynamic later
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

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("EMAIL ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}