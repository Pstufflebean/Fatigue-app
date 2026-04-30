import { Resend } from 'resend';

export default async function handler(req, res) {

  try {

    console.log("REQUEST BODY:", req.body);

    const resend = new Resend(process.env.RESEND_API_KEY);

    const { answers, totalScore, risk, timestamp } = req.body;

    if (!answers) {
      throw new Error("Missing answers array");
    }

    let answerList = "";

    answers.forEach(a => {

      let displayValue = a.value;

      if (a.type === "boolean") {
        displayValue = Number(a.value) === 1 ? "Yes" : "No";
      }

      if (a.type === "select" && a.options) {
        try {
          let opts = a.options;

          if (typeof opts === "string") {
            opts = JSON.parse(opts);
          }

          if (Array.isArray(opts)) {
            const match = opts.find(o => Number(o.value) === Number(a.value));
            if (match) displayValue = match.label;
          }

        } catch (err) {
          console.error("OPTION PARSE ERROR:", err);
        }
      }

      answerList += `
        <div>
          <strong>${a.text}</strong><br>
          ${displayValue}
        </div>
      `;
    });

    const response = await resend.emails.send({
      from: 'Fatigue App <onboarding@resend.dev>',
      to: ['your@email.com'], // 🔥 confirm this is valid
      subject: 'Fatigue Alert Test',
      html: `
        <h2>Alert</h2>
        <p>Score: ${totalScore}</p>
        <p>Risk: ${risk}</p>
        ${answerList}
      `
    });

    console.log("EMAIL RESPONSE:", response);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error("FULL ERROR:", error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
}