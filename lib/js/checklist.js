/*
 * Checklist behavior shared by the browser page and the Node tests.
 * Task text is rendered as text, never interpreted as HTML.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof document !== "undefined") {
    const start = function () {
      api.boot(document);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }
  root.ChecklistApp = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function answerIsYes(answers, questionId) {
    if (!answers || typeof answers !== "object") {
      return false;
    }
    if (Object.prototype.hasOwnProperty.call(answers, questionId)) {
      return answers[questionId] === true;
    }
    const key = String(questionId);
    if (Object.prototype.hasOwnProperty.call(answers, key)) {
      return answers[key] === true;
    }
    return false;
  }

  function taskApplies(task, answers) {
    if (!task || typeof task !== "object") {
      return false;
    }
    const required = asArray(task.questionsRequiredYes);
    const anyYes = asArray(task.questionsAnyYes);
    if (required.length === 0 && anyYes.length === 0) {
      return true;
    }
    for (let i = 0; i < anyYes.length; i += 1) {
      if (answerIsYes(answers, anyYes[i])) {
        return true;
      }
    }
    if (required.length === 0) {
      return false;
    }
    for (let i = 0; i < required.length; i += 1) {
      if (!answerIsYes(answers, required[i])) {
        return false;
      }
    }
    return true;
  }

  function applicableTasks(tasks, answers) {
    const items = [];
    asArray(tasks).forEach(function (task, index) {
      if (taskApplies(task, answers)) {
        items.push({ task: task, index: index });
      }
    });
    return items;
  }

  function defaultAnswers(questions) {
    const answers = {};
    asArray(questions).forEach(function (question) {
      if (!question || question.id === undefined || question.id === null) {
        return;
      }
      answers[question.id] = question.default === true;
    });
    return answers;
  }

  function maybeDecode(raw) {
    if (typeof raw !== "string") {
      return raw;
    }
    if (raw.indexOf("%") === -1 && raw.indexOf("+") === -1) {
      return raw;
    }
    try {
      return decodeURIComponent(raw.replace(/\+/g, " "));
    } catch (err) {
      return raw;
    }
  }

  function parseAnswersParam(raw) {
    if (raw === null || raw === undefined || raw === "") {
      return null;
    }
    let parsed;
    try {
      parsed = JSON.parse(maybeDecode(String(raw)));
    } catch (err) {
      return { error: "Could not read saved answers. Showing default answers." };
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return { error: "Saved answers were not a JSON object. Showing default answers." };
    }
    return { value: parsed };
  }

  function parseDoneParam(raw) {
    if (raw === null || raw === undefined || raw === "") {
      return {};
    }
    let parsed;
    try {
      parsed = JSON.parse(maybeDecode(String(raw)));
    } catch (err) {
      return { error: "Could not read saved completed items." };
    }
    if (!Array.isArray(parsed)) {
      return { error: "Saved completed items were not a list." };
    }
    const done = {};
    parsed.forEach(function (value) {
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        done[value] = true;
      }
    });
    return { value: done };
  }

  function resolveAnswers(questions, parsed) {
    const answers = defaultAnswers(questions);
    if (!parsed) {
      return answers;
    }
    asArray(questions).forEach(function (question) {
      if (!question || question.id === undefined || question.id === null) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(parsed, question.id)) {
        answers[question.id] = parsed[question.id] === true;
      } else if (Object.prototype.hasOwnProperty.call(parsed, String(question.id))) {
        answers[question.id] = parsed[String(question.id)] === true;
      }
    });
    return answers;
  }

  function finishSentence(value) {
    const text = String(value || "");
    if (!text || /[.!?]$/.test(text)) {
      return text;
    }
    return text + ".";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function summaryText(tasks, answers) {
    const items = applicableTasks(tasks, answers);
    const total = asArray(tasks).length;
    const hidden = total - items.length;
    return (
      items.length +
      " of " +
      total +
      " tasks apply. " +
      hidden +
      " tasks are hidden because their conditions are not met."
    );
  }

  function formatApplicableText(title, questions, tasks, answers) {
    const items = applicableTasks(tasks, answers);
    const lines = [
      String(title || "Checklist"),
      "Follow only the applicable items below. Items that do not apply are omitted from this list.",
      "Do not turn off, unplug, or disable smoke alarms or carbon monoxide alarms.",
      "A phone alarm is a reminder on a phone, not a smoke or carbon monoxide alarm.",
      "",
      "Answers:",
    ];
    asArray(questions).forEach(function (question) {
      if (!question) {
        return;
      }
      const yes = answerIsYes(answers, question.id);
      lines.push("- " + (yes ? "Yes" : "No") + ". " + (question.text || ""));
    });
    lines.push("");
    lines.push(
      "Applicable items (" + items.length + " of " + asArray(tasks).length + "):"
    );
    if (!items.length) {
      lines.push("(none)");
    } else {
      items.forEach(function (item, position) {
        const section = item.task.type ? item.task.type : "Tasks";
        const role = item.task.role ? " Role: " + item.task.role + "." : "";
        lines.push(
          position + 1 + ". " + section + ". " + agentTaskLine(item.task) + role
        );
      });
    }
    return lines.join("\n") + "\n";
  }

  function agentTaskLine(task) {
    const sentence = finishSentence(task.task);
    if (!task.note) {
      return sentence;
    }
    return sentence + " " + finishSentence(task.note);
  }

  function renderQuestions(questions, answers) {
    const list = asArray(questions).filter(function (question) {
      return question && question.id !== undefined && question.id !== null;
    });
    if (!list.length) {
      return "<p>There are no questions. Every task applies.</p>";
    }
    return list
      .map(function (question) {
        const id = String(question.id);
        const yes = answerIsYes(answers, question.id);
        const yesId = "question-" + id + "-yes";
        const noId = "question-" + id + "-no";
        const description = question.description
          ? '<p class="question-description">' +
            escapeHtml(question.description) +
            "</p>"
          : "";
        return (
          '<div class="question" role="group" aria-labelledby="question-' +
          escapeHtml(id) +
          '-text" data-testid="question-' +
          escapeHtml(id) +
          '"><p class="question-text" id="question-' +
          escapeHtml(id) +
          '-text">' +
          escapeHtml(question.text || "") +
          "</p>" +
          description +
          '<div class="answer-choices">' +
          '<input type="radio" autocomplete="off" name="question-' +
          escapeHtml(id) +
          '" id="' +
          escapeHtml(yesId) +
          '" data-testid="answer-' +
          escapeHtml(id) +
          '-yes" data-question-id="' +
          escapeHtml(id) +
          '" value="yes"' +
          (yes ? " checked" : "") +
          ">" +
          '<label for="' +
          escapeHtml(yesId) +
          '">Yes</label>' +
          '<input type="radio" autocomplete="off" name="question-' +
          escapeHtml(id) +
          '" id="' +
          escapeHtml(noId) +
          '" data-testid="answer-' +
          escapeHtml(id) +
          '-no" data-question-id="' +
          escapeHtml(id) +
          '" value="no"' +
          (yes ? "" : " checked") +
          ">" +
          '<label for="' +
          escapeHtml(noId) +
          '">No</label></div></div>'
        );
      })
      .join("");
  }

  function renderTasks(tasks, answers, done) {
    const items = applicableTasks(tasks, answers);
    if (!items.length) {
      return '<p data-testid="no-tasks">No tasks apply to these answers.</p>';
    }
    const groups = new Map();
    items.forEach(function (item) {
      const section = item.task.type ? String(item.task.type) : "Tasks";
      if (!groups.has(section)) {
        groups.set(section, []);
      }
      groups.get(section).push(item);
    });
    let html = "";
    groups.forEach(function (group, section) {
      html +=
        '<section class="task-group"><h3>' +
        escapeHtml(section) +
        '</h3><div class="task-list">';
      group.forEach(function (item) {
        const id = "task-" + item.index;
        const checked = done && done[item.index] ? " checked" : "";
        const role = item.task.role
          ? '<span class="task-role">' + escapeHtml(item.task.role) + "</span>"
          : "";
        const noteId = id + "-note";
        const describedBy = item.task.note
          ? ' aria-describedby="' + noteId + '"'
          : "";
        const note = item.task.note
          ? '<span class="visually-hidden" id="' +
            noteId +
            '">' +
            escapeHtml(item.task.note) +
            "</span>"
          : "";
        html +=
          '<div class="task-row" data-task-index="' +
          escapeHtml(item.index) +
          '"><input type="checkbox" id="' +
          id +
          '" data-testid="' +
          id +
          '" data-task-index="' +
          escapeHtml(item.index) +
          '" data-task-text="' +
          escapeHtml(item.task.task) +
          '"' +
          describedBy +
          checked +
          '><label for="' +
          id +
          '"><span class="task-text">' +
          escapeHtml(item.task.task) +
          "</span>" +
          role +
          "</label>" +
          note +
          "</div>";
      });
      html += "</div></section>";
    });
    return html;
  }

  function renderRoles(tasks, answers) {
    const items = applicableTasks(tasks, answers);
    if (!items.length) {
      return "<p>No applicable tasks to group by role.</p>";
    }
    const groups = new Map();
    items.forEach(function (item) {
      const role = item.task.role ? String(item.task.role) : "Unassigned";
      if (!groups.has(role)) {
        groups.set(role, []);
      }
      groups.get(role).push(item);
    });
    let html = "";
    groups.forEach(function (group, role) {
      const headingId = "role-" + slug(role);
      html +=
        '<section aria-labelledby="' +
        headingId +
        '"><h3 id="' +
        headingId +
        '">' +
        escapeHtml(role) +
        "</h3><ul>";
      group.forEach(function (item) {
        const section = item.task.type ? escapeHtml(item.task.type) + ". " : "";
        html += "<li>" + section + escapeHtml(item.task.task) + "</li>";
      });
      html += "</ul></section>";
    });
    return html;
  }

  function slug(value) {
    const text = String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return text || "item";
  }

  function answersForUrl(questions, answers) {
    const out = {};
    asArray(questions).forEach(function (question) {
      if (!question || question.id === undefined || question.id === null) {
        return;
      }
      out[question.id] = answerIsYes(answers, question.id);
    });
    return out;
  }

  function boot(doc) {
    if (!doc || doc.body.dataset.checklistReady === "true") {
      return;
    }
    const dataEl = doc.getElementById("checklist-data");
    if (!dataEl) {
      doc.body.dataset.checklistReady = "true";
      registerChecklistTools(doc, catalogActions(doc));
      return;
    }
    doc.body.dataset.checklistReady = "true";

    let data;
    try {
      data = JSON.parse(dataEl.textContent);
    } catch (err) {
      setStatus(doc, "Could not read the checklist data on this page.");
      return;
    }

    const questions = asArray(data.questions);
    const tasks = asArray(data.tasks);
    const title =
      data.title ||
      (doc.querySelector("h1") ? doc.querySelector("h1").textContent : "Checklist");
    const params = new URL(doc.location.href).searchParams;
    const parsedAnswers = parseAnswersParam(params.get("answers"));
    const parsedDone = parseDoneParam(params.get("done"));
    const state = {
      questions: questions,
      tasks: tasks,
      title: title,
      answers: resolveAnswers(
        questions,
        parsedAnswers && parsedAnswers.value ? parsedAnswers.value : null
      ),
      done: parsedDone && parsedDone.value ? parsedDone.value : {},
      confirmed: {},
      view: initialView(params),
    };

    const questionsRoot = doc.getElementById("questions-root");
    const tasksRoot = doc.getElementById("tasks-root");
    const rolesRoot = doc.getElementById("roles-root");
    const questionForm = doc.getElementById("question-form");

    function paint() {
      if (questionsRoot) {
        questionsRoot.innerHTML = renderQuestions(state.questions, state.answers);
      }
      if (tasksRoot) {
        tasksRoot.innerHTML = renderTasks(state.tasks, state.answers, state.done);
      }
      if (rolesRoot) {
        rolesRoot.innerHTML = renderRoles(state.tasks, state.answers);
      }
      const summary = doc.getElementById("applicable-summary");
      if (summary) {
        summary.textContent = summaryText(state.tasks, state.answers);
      }
      const pre = doc.getElementById("applicable-checklist-text");
      if (pre) {
        pre.textContent = formatApplicableText(
          state.title,
          state.questions,
          state.tasks,
          state.answers
        );
      }
    }

    function writeUrl() {
      const url = new URL(doc.location.href);
      url.searchParams.set(
        "answers",
        JSON.stringify(answersForUrl(state.questions, state.answers))
      );
      url.searchParams.set("view", state.view);
      if (state.view === "checklist") {
        url.searchParams.set("redirectToTasks", "true");
      } else {
        url.searchParams.delete("redirectToTasks");
      }
      const doneIds = Object.keys(state.done)
        .filter(function (key) {
          return state.done[key];
        })
        .map(function (key) {
          return Number(key);
        })
        .filter(function (value) {
          return Number.isInteger(value);
        })
        .sort(function (a, b) {
          return a - b;
        });
      if (doneIds.length) {
        url.searchParams.set("done", JSON.stringify(doneIds));
      } else {
        url.searchParams.delete("done");
      }
      doc.defaultView.history.replaceState(null, "", url);
    }

    function showView(view, announce) {
      state.view = view;
      ["questions", "roles", "checklist"].forEach(function (name) {
        const panel = doc.getElementById("panel-" + name);
        const tab = doc.getElementById("tab-" + name);
        const selected = name === view;
        if (panel) {
          panel.hidden = !selected;
          panel.inert = !selected;
        }
        if (tab) {
          tab.setAttribute("aria-selected", selected ? "true" : "false");
          tab.tabIndex = selected ? 0 : -1;
        }
      });
      if (announce) {
        const message =
          view === "checklist"
            ? "Showing the checklist."
            : view === "roles"
              ? "Showing tasks grouped by role."
              : "Showing questions.";
        setStatus(doc, message);
      }
    }

    paint();
    showView(state.view, false);
    const notes = [];
    if (parsedAnswers && parsedAnswers.error) {
      notes.push(parsedAnswers.error);
    }
    if (parsedDone && parsedDone.error) {
      notes.push(parsedDone.error);
    }
    if (notes.length) {
      setStatus(doc, notes.join(" "));
    }
    writeUrl();
    registerChecklistTools(doc, {
      questions: function () {
        return state.questions;
      },
      applicableItems: function () {
        return applicableTasks(state.tasks, state.answers);
      },
      listApplicable: function () {
        const items = applicableTasks(state.tasks, state.answers);
        return {
          title: state.title,
          summary: summaryText(state.tasks, state.answers),
          answers: state.questions.map(function (question) {
            return {
              id: question.id,
              text: question.text,
              answer: answerIsYes(state.answers, question.id) ? "yes" : "no",
            };
          }),
          items: items.map(function (item) {
            return {
              index: item.index,
              section: item.task.type || "Tasks",
              task: item.task.task,
              role: item.task.role || "",
              note: item.task.note || "",
              completed: state.done[item.index] === true,
            };
          }),
        };
      },
      applyAnswer: function (question, isYes) {
        state.answers[question.id] = isYes;
        state.confirmed[question.id] = true;
        paint();
        const answerWord = isYes ? "Yes" : "No";
        setStatus(
          doc,
          "Saved answer. " +
            answerWord +
            ". " +
            question.text +
            " " +
            summaryText(state.tasks, state.answers)
        );
        writeUrl();
        return {
          questionId: question.id,
          answer: isYes ? "yes" : "no",
          summary: summaryText(state.tasks, state.answers),
        };
      },
      isConfirmed: function (questionId) {
        return state.confirmed[questionId] === true;
      },
      answerWord: function (questionId) {
        return answerIsYes(state.answers, questionId) ? "yes" : "no";
      },
      summary: function () {
        return summaryText(state.tasks, state.answers);
      },
      isDone: function (taskIndex) {
        return state.done[taskIndex] === true;
      },
      applicableText: function () {
        return formatApplicableText(state.title, state.questions, state.tasks, state.answers);
      },
      copyText: function (text) {
        const clipboard = doc.defaultView && doc.defaultView.navigator && doc.defaultView.navigator.clipboard;
        if (clipboard && clipboard.writeText) {
          clipboard.writeText(text).then(
            function () {
              setStatus(doc, "Copied the applicable items.");
            },
            function () {
              setStatus(
                doc,
                "Could not copy automatically. The applicable items were returned to the caller."
              );
            }
          );
        }
      },
      showView: function (view) {
        showView(view, true);
        writeUrl();
        return { view: view };
      },
      catalog: function () {
        return checklistCatalog(doc.location.pathname);
      },
      openChecklist: function (url) {
        const schedule =
          doc.defaultView && doc.defaultView.queueMicrotask
            ? doc.defaultView.queueMicrotask.bind(doc.defaultView)
            : function (fn) {
                setTimeout(fn, 0);
              };
        schedule(function () {
          doc.location.assign(url);
        });
        return { url: url };
      },
      applyCompleted: function (match, completed) {
        state.done[match.index] = completed;
        paint();
        setStatus(
          doc,
          (completed ? "Marked complete: " : "Marked not complete: ") + match.task.task
        );
        writeUrl();
        return {
          taskIndex: match.index,
          task: match.task.task,
          completed: completed,
          summary: summaryText(state.tasks, state.answers),
        };
      },
    });

    if (questionForm) {
      questionForm.addEventListener("submit", function (event) {
        event.preventDefault();
      });
      questionForm.addEventListener("change", function (event) {
        const input = event.target;
        if (!input.matches || !input.matches("input[data-question-id]")) {
          return;
        }
        const id = input.getAttribute("data-question-id");
        const question = state.questions.find(function (item) {
          return String(item.id) === id;
        });
        if (!question) {
          return;
        }
        state.answers[question.id] = input.value === "yes";
        state.confirmed[question.id] = true;
        if (tasksRoot) {
          tasksRoot.innerHTML = renderTasks(state.tasks, state.answers, state.done);
        }
        if (rolesRoot) {
          rolesRoot.innerHTML = renderRoles(state.tasks, state.answers);
        }
        const summary = doc.getElementById("applicable-summary");
        if (summary) {
          summary.textContent = summaryText(state.tasks, state.answers);
        }
        const pre = doc.getElementById("applicable-checklist-text");
        if (pre) {
          pre.textContent = formatApplicableText(
            state.title,
            state.questions,
            state.tasks,
            state.answers
          );
        }
        const answerWord = state.answers[question.id] ? "Yes" : "No";
        setStatus(
          doc,
          "Saved answer. " +
            answerWord +
            ". " +
            question.text +
            " " +
            summaryText(state.tasks, state.answers)
        );
        writeUrl();
      });
    }

    if (tasksRoot) {
      tasksRoot.addEventListener("change", function (event) {
        const input = event.target;
        if (!input.matches || !input.matches("input[type=checkbox][data-task-index]")) {
          return;
        }
        const index = Number(input.getAttribute("data-task-index"));
        state.done[index] = input.checked;
        const taskText = input.getAttribute("data-task-text") || "item";
        setStatus(
          doc,
          (input.checked ? "Marked complete: " : "Marked not complete: ") + taskText
        );
        writeUrl();
      });
    }

    ["questions", "roles", "checklist"].forEach(function (name) {
      const tab = doc.getElementById("tab-" + name);
      if (!tab) {
        return;
      }
      tab.addEventListener("click", function () {
        showView(name, true);
        writeUrl();
      });
    });

    const tablist = doc.querySelector("[role=tablist]");
    if (tablist) {
      tablist.addEventListener("keydown", function (event) {
        const tabs = ["questions", "roles", "checklist"];
        const current = tabs.indexOf(state.view);
        let next = null;
        if (event.key === "ArrowRight") {
          next = tabs[(current + 1) % tabs.length];
        } else if (event.key === "ArrowLeft") {
          next = tabs[(current + tabs.length - 1) % tabs.length];
        }
        if (!next) {
          return;
        }
        event.preventDefault();
        showView(next, true);
        writeUrl();
        const tab = doc.getElementById("tab-" + next);
        if (tab) {
          tab.focus();
        }
      });
    }

    const copyButton = doc.getElementById("copy-applicable");
    if (copyButton) {
      copyButton.addEventListener("click", function () {
        const pre = doc.getElementById("applicable-checklist-text");
        const text = pre ? pre.textContent : "";
        const clipboard =
          doc.defaultView.navigator && doc.defaultView.navigator.clipboard;
        if (!clipboard || !clipboard.writeText) {
          setStatus(
            doc,
            "Could not copy automatically. The applicable items are in the text box on this page."
          );
          return;
        }
        clipboard.writeText(text).then(
          function () {
            setStatus(doc, "Copied the applicable items.");
          },
          function () {
            setStatus(
              doc,
              "Could not copy automatically. The applicable items are in the text box on this page."
            );
          }
        );
      });
    }
  }

  function initialView(params) {
    const redirect = params.get("redirectToTasks");
    if (redirect && redirect !== "false" && redirect !== "0") {
      return "checklist";
    }
    const view = params.get("view");
    if (view === "roles" || view === "checklist" || view === "questions") {
      return view;
    }
    return "questions";
  }

  function setStatus(doc, message) {
    const status = doc.getElementById("status");
    if (status) {
      status.textContent = message;
    }
  }

  var CHECKLISTS = [
    { slug: "travel-checklist", title: "Travel checklist" },
    { slug: "cleaning-checklist", title: "Cleaning checklist" },
    { slug: "hotel-checkout-checklist", title: "Hotel checkout checklist" },
    { slug: "jira-release-checklist", title: "Jira release checklist" },
    { slug: "moving-checklist", title: "Moving checklist" },
    { slug: "stretch-checklist", title: "Stretch checklist" },
  ];

  function checklistCatalog(pathname) {
    const inExample = /\/examples\/[^/]+\/checklist\.html$/.test(pathname || "");
    const prefix = inExample ? "../" : "examples/";
    return CHECKLISTS.map(function (item) {
      return {
        slug: item.slug,
        title: item.title,
        url: prefix + item.slug + "/checklist.html",
      };
    });
  }

  function catalogActions(doc) {
    return {
      catalog: function () {
        return checklistCatalog(doc.location ? doc.location.pathname : "");
      },
      openChecklist: function (url) {
        const schedule =
          doc.defaultView && doc.defaultView.queueMicrotask
            ? doc.defaultView.queueMicrotask.bind(doc.defaultView)
            : function (fn) {
                setTimeout(fn, 0);
              };
        schedule(function () {
          if (doc.location) {
            doc.location.assign(url);
          }
        });
        return { url: url };
      },
    };
  }

  function abortIfNeeded(context) {
    if (context && context.signal && context.signal.aborted) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
  }

  function questionRecord(actions, question) {
    return {
      id: question.id,
      text: question.text,
      answer: actions.answerWord(question.id),
      allowedAnswers: ["yes", "no"],
    };
  }

  function checklistToolDefinitions(actions) {
    const tools = [
      {
        name: "list-checklists",
        description:
          "Lists the example checklists that can be opened, with a URL for each one.",
        inputSchema: { type: "object", properties: {} },
        execute: function (_input, context) {
          abortIfNeeded(context);
          return { checklists: actions.catalog() };
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "open-checklist",
        description: "Opens one example checklist in this window.",
        inputSchema: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "Checklist folder name, such as travel-checklist.",
            },
          },
          required: ["slug"],
        },
        execute: function (input, context) {
          abortIfNeeded(context);
          const catalog = actions.catalog();
          const slug = input && input.slug;
          const match = catalog.find(function (item) {
            return item.slug === slug;
          });
          if (!match) {
            return {
              error: "No checklist uses that slug.",
              slugs: catalog.map(function (item) {
                return item.slug;
              }),
            };
          }
          return actions.openChecklist(match.url);
        },
        annotations: { readOnlyHint: false },
      },
    ];
    if (typeof actions.questions !== "function") {
      return tools;
    }
    return tools.concat([
      {
        name: "list-questions",
        description:
          "Lists every question on this checklist with its current answer. Each question already shows yes or no.",
        inputSchema: { type: "object", properties: {} },
        execute: function (_input, context) {
          abortIfNeeded(context);
          return {
            questions: actions.questions().map(function (question) {
              return questionRecord(actions, question);
            }),
          };
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "get-next-question",
        description:
          "Returns the next question that has not been confirmed yet in this page session, with the answers it accepts.",
        inputSchema: { type: "object", properties: {} },
        execute: function (_input, context) {
          abortIfNeeded(context);
          const pending = actions.questions().filter(function (question) {
            return !actions.isConfirmed(question.id);
          });
          if (!pending.length) {
            return { question: null, remaining: 0 };
          }
          return {
            question: questionRecord(actions, pending[0]),
            remaining: pending.length,
          };
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "set-question-answer",
        description: "Sets a checklist question to yes or no and updates the applicable tasks.",
        inputSchema: {
          type: "object",
          properties: {
            questionId: {
              type: "integer",
              description: "Id of the question shown on this page.",
            },
            answer: {
              type: "string",
              enum: ["yes", "no"],
              description: "The chosen answer.",
            },
          },
          required: ["questionId", "answer"],
        },
        execute: function (input, context) {
          abortIfNeeded(context);
          const payload = input || {};
          const questions = actions.questions();
          const questionIds = questions.map(function (question) {
            return question.id;
          });
          if (typeof payload.questionId !== "number" || !Number.isInteger(payload.questionId)) {
            return {
              error: "questionId must be the integer id of a question on this page.",
              questionIds: questionIds,
            };
          }
          const question = questions.find(function (item) {
            return item.id === payload.questionId;
          });
          if (!question) {
            return { error: "No question with that id is on this page.", questionIds: questionIds };
          }
          if (payload.answer !== "yes" && payload.answer !== "no") {
            return { error: "answer must be yes or no." };
          }
          return actions.applyAnswer(question, payload.answer === "yes");
        },
        annotations: { readOnlyHint: false },
      },
      {
        name: "list-applicable-tasks",
        description:
          "Lists the checklist tasks that apply to the current answers, including safety notes. Use this instead of treating tasks.json as a flat todo list.",
        inputSchema: { type: "object", properties: {} },
        execute: function (_input, context) {
          abortIfNeeded(context);
          return actions.listApplicable();
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "get-progress",
        description:
          "Counts applicable and completed tasks and lists the applicable tasks that are still open, including safety notes.",
        inputSchema: { type: "object", properties: {} },
        execute: function (_input, context) {
          abortIfNeeded(context);
          const items = actions.applicableItems();
          const remaining = items.filter(function (item) {
            return !actions.isDone(item.index);
          });
          return {
            applicable: items.length,
            completed: items.length - remaining.length,
            remainingCount: remaining.length,
            summary: actions.summary(),
            remaining: remaining.map(function (item) {
              return {
                index: item.index,
                section: item.task.type || "Tasks",
                task: item.task.task,
                role: item.task.role || "",
                note: item.task.note || "",
              };
            }),
          };
        },
        annotations: { readOnlyHint: true },
      },
      {
        name: "set-task-completed",
        description: "Marks an applicable checklist task complete or not complete.",
        inputSchema: {
          type: "object",
          properties: {
            taskIndex: {
              type: "integer",
              minimum: 0,
              description: "Index of the task in the checklist source.",
            },
            completed: {
              type: "boolean",
              description: "Whether the task is done.",
            },
          },
          required: ["taskIndex", "completed"],
        },
        execute: function (input, context) {
          abortIfNeeded(context);
          const payload = input || {};
          if (
            typeof payload.taskIndex !== "number" ||
            !Number.isInteger(payload.taskIndex) ||
            payload.taskIndex < 0
          ) {
            return { error: "taskIndex must be a non-negative integer." };
          }
          if (typeof payload.completed !== "boolean") {
            return { error: "completed must be true or false." };
          }
          const items = actions.applicableItems();
          const match = items.find(function (item) {
            return item.index === payload.taskIndex;
          });
          if (!match) {
            return {
              error: "That task is not in the applicable list.",
              applicableIndexes: items.map(function (item) {
                return item.index;
              }),
            };
          }
          return actions.applyCompleted(match, payload.completed);
        },
        annotations: { readOnlyHint: false },
      },
      {
        name: "switch-view",
        description: "Shows the questions, roles, or checklist tab.",
        inputSchema: {
          type: "object",
          properties: {
            view: {
              type: "string",
              enum: ["questions", "roles", "checklist"],
              description: "Which section to show.",
            },
          },
          required: ["view"],
        },
        execute: function (input, context) {
          abortIfNeeded(context);
          const view = input && input.view;
          const views = ["questions", "roles", "checklist"];
          if (views.indexOf(view) === -1) {
            return { error: "view must be questions, roles, or checklist.", views: views };
          }
          return actions.showView(view);
        },
        annotations: { readOnlyHint: false },
      },
      {
        name: "copy-applicable-items",
        description:
          "Returns the applicable checklist as plain text, including safety notes, and copies it when the clipboard is available.",
        inputSchema: { type: "object", properties: {} },
        execute: function (_input, context) {
          abortIfNeeded(context);
          const text = actions.applicableText();
          if (actions.copyText) {
            actions.copyText(text);
          }
          return { text: text };
        },
        annotations: { readOnlyHint: true },
      },
    ]);
  }

  function registerChecklistTools(doc, actions) {
    if (
      !doc ||
      !("modelContext" in doc) ||
      !doc.modelContext ||
      typeof doc.modelContext.registerTool !== "function"
    ) {
      return false;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    checklistToolDefinitions(actions).forEach(function (tool) {
      Promise.resolve(doc.modelContext.registerTool(tool, { signal: signal })).catch(
        function () {}
      );
    });
    if (doc.defaultView) {
      doc.defaultView.addEventListener(
        "pagehide",
        function () {
          controller.abort();
        },
        { once: true }
      );
    }
    return true;
  }

  return {
    answerIsYes: answerIsYes,
    taskApplies: taskApplies,
    applicableTasks: applicableTasks,
    defaultAnswers: defaultAnswers,
    parseAnswersParam: parseAnswersParam,
    parseDoneParam: parseDoneParam,
    resolveAnswers: resolveAnswers,
    escapeHtml: escapeHtml,
    summaryText: summaryText,
    formatApplicableText: formatApplicableText,
    renderQuestions: renderQuestions,
    renderTasks: renderTasks,
    renderRoles: renderRoles,
    answersForUrl: answersForUrl,
    boot: boot,
    checklistToolDefinitions: checklistToolDefinitions,
    registerChecklistTools: registerChecklistTools,
  };
});
