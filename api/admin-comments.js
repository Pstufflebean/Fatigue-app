
const { createClient } = require("@supabase/supabase-js");
const crypto = require("node:crypto");

// =====================================================
// ATLAS EMERGENCY SYSTEMS
// ADMINISTRATIVE ASSESSMENT COMMENTS API
// =====================================================

const AGENCY_ID = "LCAD";

const MAX_COMMENT_LENGTH = 2000;
const MAX_BODY_BYTES = 32 * 1024;
const MAX_LOOKUP_IDS = 100;

const SESSION_DURATION = 8 * 60 * 60;

const SESSION_COOKIE =
  "__Host-atlas-admin-session";

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value)
  );
}

function secureCompare(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  const first = crypto
    .createHash("sha256")
    .update(a)
    .digest();

  const second = crypto
    .createHash("sha256")
    .update(b)
    .digest();

  return crypto.timingSafeEqual(
    first,
    second
  );
}

// =====================================================
// SESSION SIGNATURE
// =====================================================

function signSession(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

// =====================================================
// CREATE ADMIN SESSION
// =====================================================

function createSession(secret) {
  const issuedAt =
    Math.floor(Date.now() / 1000);

  const payload = {
    role: "admin",
    agency: AGENCY_ID,
    iat: issuedAt,
    exp: issuedAt + SESSION_DURATION,
    nonce: crypto
      .randomBytes(16)
      .toString("hex")
  };

  const encoded = Buffer
    .from(JSON.stringify(payload))
    .toString("base64url");

  const signature =
    signSession(encoded, secret);

  return encoded + "." + signature;
}

// =====================================================
// READ SESSION COOKIE
// =====================================================

function getSessionCookie(req) {
  const cookies = String(
    req.headers.cookie || ""
  ).split(";");

  for (const cookie of cookies) {
    const entry = cookie.trim();

    const prefix =
      SESSION_COOKIE + "=";

    if (entry.startsWith(prefix)) {
      return entry.slice(prefix.length);
    }
  }

  return null;
}

// =====================================================
// VERIFY ADMIN SESSION
// =====================================================

function verifySession(token, secret) {
  if (
    typeof token !== "string" ||
    token.length > 2048
  ) {
    return false;
  }

  try {
    const parts = token.split(".");

    if (parts.length !== 2) {
      return false;
    }

    const [encoded, signature] = parts;

    const expected =
      signSession(encoded, secret);

    if (
      !secureCompare(
        signature,
        expected
      )
    ) {
      return false;
    }

    const payload = JSON.parse(
      Buffer
        .from(encoded, "base64url")
        .toString("utf8")
    );

    const now =
      Math.floor(Date.now() / 1000);

    return (
      payload.role === "admin" &&
      payload.agency === AGENCY_ID &&
      Number.isInteger(payload.exp) &&
      payload.exp > now
    );

  } catch {
    return false;
  }
}

// =====================================================
// COOKIE MANAGEMENT
// =====================================================

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      `Max-Age=${SESSION_DURATION}`
    ].join("; ")
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Max-Age=0"
    ].join("; ")
  );
}

// =====================================================
// REQUEST ORIGIN VALIDATION
// =====================================================

function validOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;

  if (
    typeof origin !== "string" ||
    typeof host !== "string"
  ) {
    return false;
  }

  try {
    const parsed = new URL(origin);

    return (
      parsed.protocol === "https:" &&
      parsed.host === host
    );

  } catch {
    return false;
  }
}

// =====================================================
// MAIN API HANDLER
// =====================================================

module.exports = async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  // ===================================================
  // REQUEST METHOD
  // ===================================================

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // ===================================================
  // SAME-ORIGIN PROTECTION
  // ===================================================

  if (!validOrigin(req)) {
    return res.status(403).json({
      error: "Invalid request origin"
    });
  }

  // ===================================================
  // REQUEST SIZE
  // ===================================================

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

  // ===================================================
  // ENVIRONMENT CONFIGURATION
  // ===================================================

  const adminPassword =
    process.env.ADMIN_PASSWORD;

  const sessionSecret =
    process.env.ADMIN_SESSION_SECRET;

  const supabaseUrl =
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !adminPassword ||
    !sessionSecret ||
    sessionSecret.length < 32 ||
    !supabaseUrl ||
    !serviceRoleKey
  ) {
    console.error(
      "Administrative comments API configuration missing"
    );

    return res.status(503).json({
      error: "Administrative service unavailable"
    });
  }

  // ===================================================
  // PARSE REQUEST BODY
  // ===================================================

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
    Array.isArray(body)
  ) {
    return res.status(400).json({
      error: "Invalid request"
    });
  }

  if (
    Buffer.byteLength(
      JSON.stringify(body),
      "utf8"
    ) > MAX_BODY_BYTES
  ) {
    return res.status(413).json({
      error: "Request too large"
    });
  }

  const action = body.action;

  // ===================================================
  // ADMIN LOGIN
  // ===================================================

  if (action === "login") {

    if (
      typeof body.password !== "string" ||
      body.password.length > 1024 ||
      !secureCompare(
        body.password,
        adminPassword
      )
    ) {
      return res.status(401).json({
        error: "Invalid administrator password"
      });
    }

    const session =
      createSession(sessionSecret);

    setSessionCookie(
      res,
      session
    );

    return res.status(200).json({
      authenticated: true,
      agency_id: AGENCY_ID
    });
  }

  // ===================================================
  // ADMIN LOGOUT
  // ===================================================

  if (action === "logout") {
    clearSessionCookie(res);

    return res.status(200).json({
      authenticated: false
    });
  }

  // ===================================================
  // REQUIRE AUTHENTICATED SESSION
  // ===================================================

  const token =
    getSessionCookie(req);

  if (
    !verifySession(
      token,
      sessionSecret
    )
  ) {
    return res.status(401).json({
      error: "Administrator authentication required"
    });
  }

  // ===================================================
  // SESSION STATUS
  // ===================================================

  if (action === "session") {
    return res.status(200).json({
      authenticated: true,
      agency_id: AGENCY_ID
    });
  }

  // ===================================================
  // SUPABASE SERVER CLIENT
  // ===================================================

  try {

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

    // =================================================
    // RETRIEVE ADMINISTRATIVE COMMENTS
    // =================================================

    if (action === "list") {

      if (
        !Array.isArray(body.assessment_ids) ||
        body.assessment_ids.length >
          MAX_LOOKUP_IDS ||
        body.assessment_ids.some(
          id => !isUuid(id)
        )
      ) {
        return res.status(400).json({
          error: "Invalid assessment identifiers"
        });
      }

      const ids = [
        ...new Set(body.assessment_ids)
      ];

      if (!ids.length) {
        return res.status(200).json({
          comments: []
        });
      }

      // Only permit comments associated with
      // LCAD RED assessments.

      const {
        data: eligible,
        error: eligibleError
      } = await supabase
        .from("assessments")
        .select("id")
        .eq("agency_id", AGENCY_ID)
        .eq("risk_color", "RED")
        .in("id", ids);

      if (eligibleError) {
        throw new Error(
          "Assessment lookup failed"
        );
      }

      const eligibleIds =
        (eligible || []).map(
          assessment => assessment.id
        );

      if (!eligibleIds.length) {
        return res.status(200).json({
          comments: []
        });
      }

      const {
        data: comments,
        error: commentError
      } = await supabase
        .from("assessment_comments")
        .select(
          "assessment_id, comment, " +
          "created_at, updated_at"
        )
        .in(
          "assessment_id",
          eligibleIds
        );

      if (commentError) {
        throw new Error(
          "Comment retrieval failed"
        );
      }

      return res.status(200).json({
        comments: comments || []
      });
    }

    // =================================================
    // ADD OR UPDATE ADMINISTRATIVE COMMENT
    // =================================================

    if (action === "save") {

      const assessmentId =
        body.assessment_id;

      if (!isUuid(assessmentId)) {
        return res.status(400).json({
          error: "Invalid assessment identifier"
        });
      }

      if (
        typeof body.comment !== "string"
      ) {
        return res.status(400).json({
          error: "Invalid comment"
        });
      }

      const comment =
        body.comment.trim();

      if (
        !comment ||
        comment.length > MAX_COMMENT_LENGTH
      ) {
        return res.status(400).json({
          error:
            "Comments must contain between " +
            "1 and 2000 characters"
        });
      }

      // Confirm the assessment belongs to LCAD
      // and is classified as RED.

      const {
        data: assessment,
        error: assessmentError
      } = await supabase
        .from("assessments")
        .select(
          "id, agency_id, risk_color"
        )
        .eq("id", assessmentId)
        .eq("agency_id", AGENCY_ID)
        .eq("risk_color", "RED")
        .maybeSingle();

      if (assessmentError) {
        throw new Error(
          "Assessment lookup failed"
        );
      }

      if (!assessment) {
        return res.status(404).json({
          error:
            "Eligible RED assessment not found"
        });
      }

      // Insert a new comment or update the
      // existing comment for this assessment.
      //
      // Database triggers automatically preserve
      // created_at and update updated_at.

      const {
        data: savedComment,
        error: saveError
      } = await supabase
        .from("assessment_comments")
        .upsert(
          {
            assessment_id: assessmentId,
            comment: comment
          },
          {
            onConflict: "assessment_id"
          }
        )
        .select(
          "assessment_id, comment, " +
          "created_at, updated_at"
        )
        .single();

      if (
        saveError ||
        !savedComment
      ) {
        throw new Error(
          "Administrative comment save failed"
        );
      }

      return res.status(200).json({
        saved: true,
        comment: savedComment
      });
    }

    // =================================================
    // INVALID ACTION
    // =================================================

    return res.status(400).json({
      error: "Invalid administrative action"
    });

  } catch (error) {

    // Do not log comment content or passwords.

    console.error(
      "Administrative comments API operation failed"
    );

    return res.status(503).json({
      error:
        "Administrative comments service unavailable"
    });
  }
};
