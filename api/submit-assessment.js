
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ANSWERS = 20;

const AGENCY_ID = "LCAD";

const PEER_SUPPORT_ID =
  "8ecad03b-9e35-4fc0-aaa4-cfb4bd5647c5";

const PROVIDER_NAME_ID =
  "c93bd0a1-3247-4821-b7fa-9cb7fd03874b";

const ALERT_TO = "patrikstufflebean@yahoo.com";
const ALERT_FROM = "Fatigue App <alerts@atlasemergencysystems.com>";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function logSupabaseDiagnostics(url) {
  console.log("Supabase URL diagnostics:", {
    validHttps: url.startsWith("https://"),
    expectedHost:
      /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url),
    length: url.length,
    hasWhitespace: /\s/.test(url),
    hasTrailingSlash: url.endsWith("/"),
    hasRestPath: url.includes("/rest/v1")
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  // =====================================================
  // REQUEST METHOD VALIDATION
  // =====================================================

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // =====================================================
  // REQUEST SIZE VALIDATION
  // =====================================================

  const contentLength = Number(
    req.headers["content-length"] || 0
  );

  if (
    !Number.isFinite(contentLength) ||
    contentLength < 0 ||
    contentLength > MAX_BODY_BYTES
  ) {
    return res.status(413).json({
      error: "Request too large"
    });
  }

  // =====================================================
  // ENVIRONMENT CONFIGURATION
  // =====================================================

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "Assessment API configuration missing"
    );

    return res.status(503).json({
      error: "Assessment service unavailable"
    });
  }

  // Diagnostic information only.
  // Does not log the Supabase URL or credentials.

  logSupabaseDiagnostics(supabaseUrl);

  // =====================================================
  // REQUEST BODY VALIDATION
  // =====================================================

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        error: "Invalid JSON"
      });
    }
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Array.isArray(body.answers) ||
    body.answers.length === 0 ||
    body.answers.length > MAX_ANSWERS
  ) {
    return res.status(400).json({
      error: "Invalid assessment"
    });
  }

  const answers = [];

  for (const item of body.answers) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      !isUuid(item.question_id) ||
      !Object.prototype.hasOwnProperty.call(
        item,
        "value"
      ) ||
      item.value === null ||
      !(
        typeof item.value === "string" ||
        (
          typeof item.value === "number" &&
          Number.isFinite(item.value)
        ) ||
        Array.isArray(item.value)
      )
    ) {
      return res.status(400).json({
        error: "Invalid answer format"
      });
    }

    answers.push({
      question_id: item.question_id,
      value: item.value
    });
  }

  // =====================================================
  // CREATE SUPABASE CLIENT
  // =====================================================

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );

  // =====================================================
  // SAVE ASSESSMENT
  // =====================================================

  let saved;

  try {
    const { data, error } = await supabase.rpc(
      "submit_fatigue_assessment",
      {
        p_agency_id: AGENCY_ID,
        p_answers: answers
      }
    );

    if (error) {
      console.error("Assessment RPC failed:", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });

      if (error.code === "P0001") {
        return res.status(400).json({
          error: "Assessment validation failed"
        });
      }

      return res.status(503).json({
        error: "Assessment could not be saved"
      });
    }

    if (
      !data ||
      data.saved !== true ||
      !isUuid(data.assessment_id) ||
      !Number.isFinite(Number(data.total_score)) ||
      !["GREEN", "YELLOW", "ORANGE", "RED"]
        .includes(data.risk_color)
    ) {
      console.error(
        "Unexpected assessment RPC response"
      );

      return res.status(503).json({
        error: "Assessment confirmation unavailable"
      });
    }

    saved = data;

  } catch (error) {
    console.error(
      "Assessment API exception:",
      error?.name || "unknown"
    );

    return res.status(503).json({
      error: "Assessment service unavailable"
    });
  }

  // =====================================================
  // SERVER-SIDE EMAIL ALERTS
  // =====================================================
  // Assessment is already saved at this point.
  // Email failure must not undo the assessment.

  let alertStatus = "not_required";

  try {
    const {
      data: assessment,
      error: assessmentError
    } = await supabase
      .from("assessments")
      .select(
        "id, agency_id, total_score, risk_color"
      )
      .eq("id", saved.assessment_id)
      .eq("agency_id", AGENCY_ID)
      .single();

    if (assessmentError || !assessment) {
      throw new Error(
        "Assessment lookup failed"
      );
    }

    const {
      data: storedAnswers,
      error: answersError
    } = await supabase
      .from("answers")
      .select("question_id, value")
      .eq(
        "assessment_id",
        assessment.id
      )
      .in("question_id", [
        PEER_SUPPORT_ID,
        PROVIDER_NAME_ID
      ]);

    if (answersError) {
      throw new Error(
        "Alert answer lookup failed"
      );
    }

    // ===================================================
    // ALERT TRIGGER CONDITIONS
    // ===================================================

    const peerRequested =
      storedAnswers?.some(
        answer =>
          answer.question_id === PEER_SUPPORT_ID &&
          Number(answer.value) === 1
      ) || false;

    const redRisk =
      Number(assessment.total_score) >= 10;

    if (peerRequested || redRisk) {
      alertStatus = "failed";

      if (!process.env.RESEND_API_KEY) {
        throw new Error(
          "Resend configuration missing"
        );
      }

      // Retrieve provider name only when
      // peer-support resources were requested.

      const providerName = peerRequested
        ? (
            storedAnswers.find(
              answer =>
                answer.question_id ===
                PROVIDER_NAME_ID
            )?.value || "Not provided"
          )
        : null;

      const reasons = [];

      if (redRisk) {
        reasons.push(
          "RED fatigue risk"
        );
      }

      if (peerRequested) {
        reasons.push(
          "Peer-support resources requested"
        );
      }

      // =================================================
      // EMAIL CONTENT
      // =================================================

      const html = `
        <h2>Fatigue Alert Test</h2>

        <p>
          <strong>Agency:</strong>
          ${escapeHtml(AGENCY_ID)}
        </p>

        <p>
          <strong>Reason:</strong>
          ${escapeHtml(reasons.join("; "))}
        </p>

        <p>
          <strong>Score:</strong>
          ${escapeHtml(assessment.total_score)}
        </p>

        <p>
          <strong>Risk:</strong>
          ${escapeHtml(assessment.risk_color)}
        </p>

        ${
          peerRequested
            ? `
              <p>
                <strong>
                  Provider requesting resources:
                </strong>
                ${escapeHtml(providerName)}
              </p>
            `
            : ""
        }

        <p>
          <strong>Assessment ID:</strong>
          ${escapeHtml(assessment.id)}
        </p>
      `;

      // =================================================
      // SEND EMAIL
      // =================================================

      const resend = new Resend(
        process.env.RESEND_API_KEY
      );

      const {
        data: emailData,
        error: sendError
      } = await resend.emails.send({
        from: ALERT_FROM,
        to: [ALERT_TO],
        subject: "Fatigue Alert Test",
        html
      });

      
if (sendError) {
  console.error("Resend API rejected email:", {
    name: sendError.name,
    message: sendError.message,
    statusCode: sendError.statusCode
  });

  throw new Error("Resend rejected alert");
}

if (!emailData?.id) {
  console.error(
    "Resend returned no email confirmation ID"
  );

  throw new Error(
    "Resend did not confirm email acceptance"
  );
}


      alertStatus = "sent";
    }

  } catch (error) {
    alertStatus = "failed";

    // Do not log provider names or answers.

    console.error(
      "Post-save alert processing failed:",
      error?.message || "unknown"
    );
  }

  // =====================================================
  // FINAL RESPONSE
  // =====================================================

  return res.status(201).json({
    saved: true,
    assessment_id: saved.assessment_id,
    total_score: Number(saved.total_score),
    risk_color: saved.risk_color,
    alert_status: alertStatus
  });
};
