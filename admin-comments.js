
// =====================================================
// ATLAS EMERGENCY SYSTEMS
// ADMINISTRATIVE COMMENTS INTERFACE
// =====================================================

(function () {
  "use strict";

  const COMMENT_LIMIT = 2000;
  const AGENCY = "LCAD";
  const PAGE_SIZE = 100;

  let loginBusy = false;

  // ===================================================
  // ADMINISTRATIVE API
  // ===================================================

  async function adminCommentRequest(
    action,
    payload = {}
  ) {
    const response = await fetch(
      "/api/admin-comments",
      {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...payload,
          action
        })
      }
    );

    let result;

    try {
      result = await response.json();
    } catch {
      throw new Error(
        "Administrative service unavailable."
      );
    }

    if (!response.ok) {
      const error = new Error(
        result.error ||
        "Administrative request failed."
      );

      error.status = response.status;

      throw error;
    }

    return result;
  }

  // ===================================================
  // SERVER-SIDE ADMINISTRATOR LOGIN
  // ===================================================

  window.login = async function () {
    if (loginBusy) {
      return;
    }

    const passwordInput =
      document.getElementById("passwordInput");

    const loginButton =
      document.getElementById("adminLoginButton");

    const loginStatus =
      document.getElementById("adminLoginStatus");

    const password = passwordInput.value;

    if (!password) {
      loginStatus.textContent =
        "Enter your administrator password.";

      return;
    }

    loginBusy = true;
    loginButton.disabled = true;
    loginButton.textContent = "Signing in...";
    loginStatus.textContent = "";

    try {
      const result = await adminCommentRequest(
        "login",
        { password }
      );

      if (result.authenticated !== true) {
        throw new Error(
          "Administrator authentication failed."
        );
      }

      passwordInput.value = "";

      document.getElementById(
        "login"
      ).style.display = "none";

      document.getElementById(
        "adminPanel"
      ).style.display = "block";

      await window.loadAssessments();

    } catch (error) {
      loginStatus.textContent =
        error.message ||
        "Unable to sign in.";

    } finally {
      loginBusy = false;
      loginButton.disabled = false;
      loginButton.textContent = "Enter";
    }
  };

  // ===================================================
  // SESSION EXPIRATION
  // ===================================================

  function returnToLogin() {
    document.getElementById(
      "adminPanel"
    ).style.display = "none";

    document.getElementById(
      "reportingView"
    ).style.display = "none";

    document.getElementById(
      "assessmentView"
    ).style.display = "block";

    document.getElementById(
      "assessmentList"
    ).replaceChildren();

    document.getElementById(
      "reportingStatus"
    ).textContent = "";

    if (typeof latestFatigueReport !== "undefined") {
      latestFatigueReport = null;
    }

    document.getElementById(
      "login"
    ).style.display = "block";

    document.getElementById(
      "adminLoginStatus"
    ).textContent =
      "Your session has expired. Please sign in again.";
  }

  // ===================================================
  // COMMENT DATE FORMATTING
  // ===================================================

  function formatCommentDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);

    if (!Number.isFinite(date.getTime())) {
      return "";
    }

    return new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "America/Chicago",
        dateStyle: "medium",
        timeStyle: "short"
      }
    ).format(date) + " CT";
  }

  // ===================================================
  // BUTTON HELPER
  // ===================================================

  function createCommentButton(
    label,
    className
  ) {
    const button =
      document.createElement("button");

    button.type = "button";
    button.className = className;
    button.textContent = label;

    return button;
  }

  // ===================================================
  // ADMINISTRATIVE COMMENT COMPONENT
  // ===================================================

  function createCommentPanel(
    assessment,
    existingComment,
    commentsAvailable
  ) {
    const panel =
      document.createElement("div");

    panel.className = "admin-comment-panel";

    let savedComment =
      existingComment || null;

    const heading =
      document.createElement("div");

    heading.className =
      "admin-comment-heading";

    heading.textContent =
      "Administrative Comments";

    const display =
      document.createElement("div");

    display.className =
      "admin-comment-display";

    const metadata =
      document.createElement("div");

    metadata.className =
      "admin-comment-metadata";

    const status =
      document.createElement("div");

    status.className =
      "admin-comment-status";

    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const editButton = createCommentButton(
      "Add Comment",
      "admin-comment-button"
    );

    const editor =
      document.createElement("div");

    editor.className =
      "admin-comment-editor";

    editor.style.display = "none";

    // =================================================
    // PRIVACY NOTICE
    // =================================================

    const notice =
      document.createElement("div");

    notice.className =
      "admin-comment-notice";

    notice.textContent =
      "Document administrative actions and fatigue " +
      "mitigation measures. Do not include provider " +
      "names, patient information, or unnecessary " +
      "personal or medical details. Comments may " +
      "appear in PDF reports.";

    // =================================================
    // TEXT ENTRY
    // =================================================

    const textarea =
      document.createElement("textarea");

    textarea.className =
      "admin-comment-textarea";

    textarea.rows = 5;
    textarea.maxLength = COMMENT_LIMIT;

    textarea.setAttribute(
      "aria-label",
      "Administrative comment"
    );

    textarea.placeholder =
      "Document supervisory review, fatigue " +
      "mitigation measures, or follow-up actions...";

    const counter =
      document.createElement("div");

    counter.className =
      "admin-comment-counter";

    function updateCounter() {
      counter.textContent =
        textarea.value.length +
        " / " +
        COMMENT_LIMIT +
        " characters";
    }

    textarea.addEventListener(
      "input",
      updateCounter
    );

    // =================================================
    // SAVE AND CANCEL
    // =================================================

    const actions =
      document.createElement("div");

    actions.className =
      "admin-comment-actions";

    const saveButton = createCommentButton(
      "Save Comment",
      "admin-comment-button"
    );

    const cancelButton = createCommentButton(
      "Cancel",
      "admin-comment-secondary"
    );

    actions.append(
      saveButton,
      cancelButton
    );

    editor.append(
      notice,
      textarea,
      counter,
      actions
    );

    // =================================================
    // DISPLAY SAVED COMMENT
    // =================================================

    function renderSavedComment() {
      if (
        savedComment &&
        typeof savedComment.comment === "string"
      ) {
        // Use textContent to prevent HTML injection.

        display.textContent =
          savedComment.comment;

        display.classList.remove(
          "admin-comment-empty"
        );

        const created = formatCommentDate(
          savedComment.created_at
        );

        const updated = formatCommentDate(
          savedComment.updated_at
        );

        metadata.textContent =
          "Created: " + created +
          (
            updated && updated !== created
              ? " | Last edited: " + updated
              : ""
          );

        editButton.textContent =
          "Edit Comment";

      } else {
        display.textContent =
          commentsAvailable
            ? "No administrative comment recorded."
            : "Existing comments could not be retrieved.";

        display.classList.add(
          "admin-comment-empty"
        );

        metadata.textContent = "";

        editButton.textContent =
          "Add Comment";
      }

      editButton.disabled =
        !commentsAvailable;
    }

    // =================================================
    // OPEN EDITOR
    // =================================================

    editButton.addEventListener(
      "click",
      event => {
        event.stopPropagation();

        textarea.value =
          savedComment?.comment || "";

        updateCounter();

        status.textContent = "";

        editor.style.display = "block";

        editButton.style.display = "none";

        textarea.focus();
      }
    );

    // =================================================
    // CANCEL EDIT
    // =================================================

    cancelButton.addEventListener(
      "click",
      event => {
        event.stopPropagation();

        textarea.value = "";

        editor.style.display = "none";

        editButton.style.display =
          "inline-block";

        status.textContent = "";
      }
    );

    // =================================================
    // SAVE COMMENT
    // =================================================

    saveButton.addEventListener(
      "click",
      async event => {
        event.stopPropagation();

        const comment =
          textarea.value.trim();

        if (!comment) {
          status.textContent =
            "Enter a comment before saving.";

          return;
        }

        if (comment.length > COMMENT_LIMIT) {
          status.textContent =
            "The comment exceeds 2000 characters.";

          return;
        }

        saveButton.disabled = true;
        cancelButton.disabled = true;
        textarea.disabled = true;

        saveButton.textContent =
          "Saving...";

        status.textContent = "";

        try {
          const result =
            await adminCommentRequest(
              "save",
              {
                assessment_id:
                  assessment.id,

                comment
              }
            );

          if (
            result.saved !== true ||
            !result.comment
          ) {
            throw new Error(
              "Comment save could not be confirmed."
            );
          }

          savedComment = result.comment;

          renderSavedComment();

          textarea.value = "";

          editor.style.display = "none";

          editButton.style.display =
            "inline-block";

          status.textContent =
            "Comment saved successfully.";

          status.style.color =
            "#15803d";

        } catch (error) {
          status.style.color =
            "#b91c1c";

          status.textContent =
            error.message ||
            "Unable to save comment.";

          if (error.status === 401) {
            status.textContent =
              "Session expired. Copy your unsaved " +
              "comment before refreshing and signing " +
              "in again.";
          }

        } finally {
          saveButton.disabled = false;
          cancelButton.disabled = false;
          textarea.disabled = false;

          saveButton.textContent =
            "Save Comment";
        }
      }
    );

    renderSavedComment();

    panel.append(
      heading,
      display,
      metadata,
      editButton,
      editor,
      status
    );

    return panel;
  }

  // ===================================================
  // RETRIEVE ASSESSMENT COMMENTS
  // ===================================================

  async function loadComments(
    assessments
  ) {
    const comments = new Map();

    const redIds = assessments
      .filter(
        assessment =>
          String(
            assessment.risk_color || ""
          ).toUpperCase() === "RED"
      )
      .map(
        assessment => assessment.id
      );

    for (
      let start = 0;
      start < redIds.length;
      start += 100
    ) {
      const ids = redIds.slice(
        start,
        start + 100
      );

      const result =
        await adminCommentRequest(
          "list",
          {
            assessment_ids: ids
          }
        );

      for (
        const comment of
        result.comments || []
      ) {
        comments.set(
          comment.assessment_id,
          comment
        );
      }
    }

    return comments;
  }

  // ===================================================
  // LOAD LCAD ASSESSMENTS
  // ===================================================

  async function retrieveAssessments() {
    const assessments = [];

    let offset = 0;

    while (true) {
      const { data, error } =
        await supabaseClient
          .from("assessments")
          .select("*")
          .eq("agency_id", AGENCY)
          .order(
            "created_at",
            { ascending: false }
          )
          .order(
            "id",
            { ascending: false }
          )
          .range(
            offset,
            offset + PAGE_SIZE - 1
          );

      if (error) {
        throw new Error(
          "Unable to load assessments."
        );
      }

      assessments.push(
        ...(data || [])
      );

      if (
        !data ||
        data.length < PAGE_SIZE
      ) {
        break;
      }

      offset += PAGE_SIZE;
    }

    return assessments;
  }

  // ===================================================
  // UPDATED ASSESSMENT LIST
  // ===================================================
  // Existing category calculations and assessment
  // detail rendering remain in admin.js.

  window.loadAssessments = async function () {
    const container =
      document.getElementById(
        "assessmentList"
      );

    container.textContent =
      "Loading assessments...";

    try {
      const session =
        await adminCommentRequest(
          "session"
        );

      if (
        session.authenticated !== true
      ) {
        returnToLogin();
        return;
      }

      const assessments =
        await retrieveAssessments();

      let comments = new Map();
      let commentsAvailable = true;

      try {
        comments = await loadComments(
          assessments
        );

      } catch (error) {
        if (error.status === 401) {
          returnToLogin();
          return;
        }

        commentsAvailable = false;
      }

      container.replaceChildren();

      if (!assessments.length) {
        container.textContent =
          "No assessments found.";

        return;
      }

      if (!commentsAvailable) {
        const warning =
          document.createElement("p");

        warning.className =
          "admin-comment-status";

        warning.textContent =
          "Assessment records are available, but " +
          "administrative comments could not be loaded. " +
          "Comment editing is temporarily disabled.";

        container.appendChild(warning);
      }

      for (
        const assessment of assessments
      ) {
        const {
          data: answers,
          error: answerError
        } = await supabaseClient
          .from("answers")
          .select(`
            question_id,
            value,
            weighted_score,
            questions (
              text,
              type,
              options,
              order_index
            )
          `)
          .eq(
            "assessment_id",
            assessment.id
          );

        const answerList =
          answers || [];

        answerList.sort(
          (a, b) =>
            Number(
              a.questions?.order_index ??
              9999
            ) -
            Number(
              b.questions?.order_index ??
              9999
            )
        );

        const formattedDate = new Date(
          assessment.created_at
        ).toLocaleString();

        const totalScore =
          Number(
            assessment.total_score
          ) || 0;

        const riskColor = String(
          assessment.risk_color || ""
        ).toUpperCase();

        const riskStyle =
          getRiskStyle(riskColor);

        // =============================================
        // EXISTING ASSESSMENT HEADER
        // =============================================

        const block =
          document.createElement("div");

        block.className =
          "admin-assessment-block";

        const header =
          document.createElement("div");

        header.className =
          "admin-assessment-header";

        header.tabIndex = 0;

        header.setAttribute(
          "role",
          "button"
        );

        header.setAttribute(
          "aria-expanded",
          "false"
        );

        header.innerHTML = `
          <div class="admin-header-main">

            <strong>
              ${escapeHTML(formattedDate)}
            </strong>

            <span class="admin-header-score">
              Score: ${escapeHTML(totalScore)}
            </span>

          </div>

          <div class="admin-header-right">

            <span
              class="admin-risk-badge"
              style="
                background:${riskStyle.background};
                color:${riskStyle.color};
              "
            >
              ${escapeHTML(riskColor)}
            </span>

            <span class="admin-expand-icon">
              +
            </span>

          </div>
        `;

        // =============================================
        // EXISTING ASSESSMENT DETAILS
        // =============================================

        const details =
          document.createElement("div");

        details.className =
          "admin-assessment-details";

        details.style.display =
          "none";

        if (answerError) {
          details.textContent =
            "Unable to load answers for this " +
            "assessment. Category totals cannot " +
            "be calculated.";

        } else {
          details.innerHTML =
            buildAssessmentDetails(
              answerList,
              totalScore
            );
        }

        header.addEventListener(
          "click",
          () => toggleDetails(header)
        );

        header.addEventListener(
          "keydown",
          event => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              event.preventDefault();

              toggleDetails(header);
            }
          }
        );

        block.append(
          header,
          details
        );

        // =============================================
        // RED ASSESSMENT COMMENTS
        // =============================================

        if (riskColor === "RED") {
          const commentPanel =
            createCommentPanel(
              assessment,
              comments.get(
                assessment.id
              ),
              commentsAvailable
            );

          // Keep comment controls separate from
          // the expandable assessment header.

          block.appendChild(
            commentPanel
          );
        }

        container.appendChild(block);
      }

    } catch (error) {
      if (error.status === 401) {
        returnToLogin();
        return;
      }

      container.textContent =
        error.message ||
        "Unable to load assessments.";
    }
  };

  // ===================================================
  // REPORTING INTEGRATION HELPER
  // ===================================================
  // Will be used by the PDF reporting module in the
  // next development stage.

  window.loadAdministrativeReportComments =
    async function (assessments) {
      const comments =
        await loadComments(assessments);

      return assessments
        .filter(
          assessment =>
            String(
              assessment.risk_color || ""
            ).toUpperCase() === "RED"
        )
        .map(
          assessment => {
            const saved =
              comments.get(
                assessment.id
              );

            return {
              assessment_id:
                assessment.id,

              assessment_date:
                assessment.created_at,

              total_score:
                Number(
                  assessment.total_score
                ),

              risk_color: "RED",

              comment:
                saved?.comment || null,

              comment_created_at:
                saved?.created_at || null,

              comment_updated_at:
                saved?.updated_at || null
            };
          }
        );
    };

})();
