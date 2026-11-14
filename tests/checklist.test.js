const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../lib/js/checklist.js");

const travelLike = {
  questions: [
    { id: 8, text: "Is the house going to be empty?", default: false },
    { id: 1, text: "Are you taking a plane?" },
  ],
  tasks: [
    {
      questionsRequiredYes: [],
      questionsAnyYes: [],
      role: "Me",
      type: "Safety",
      task: "Leave every smoke alarm and carbon monoxide alarm turned on and plugged in.",
    },
    {
      questionsRequiredYes: [],
      questionsAnyYes: [],
      role: "Me",
      type: "Night Before",
      task: "Set a phone alarm to wake up",
    },
    {
      questionsRequiredYes: [8],
      questionsAnyYes: [],
      role: "Me",
      type: "Day Of",
      task: "Turn off air conditioners and heaters",
      note: "Leave smoke alarms and carbon monoxide alarms on and plugged in.",
    },
    {
      questionsRequiredYes: [8],
      questionsAnyYes: [],
      role: "Me",
      type: "Day Of",
      task: "Unplug nonessential electronics",
      note: "Do not unplug smoke alarms, carbon monoxide alarms, or the refrigerator.",
    },
  ],
};

test("default answers omit empty-house tasks and keep the safety line", () => {
  const answers = app.defaultAnswers(travelLike.questions);
  const text = app.formatApplicableText(
    "Travel checklist",
    travelLike.questions,
    travelLike.tasks,
    answers
  );
  const html = app.renderTasks(travelLike.tasks, answers, {});
  assert.match(text, /Leave every smoke alarm and carbon monoxide alarm turned on/);
  assert.match(text, /Set a phone alarm to wake up/);
  assert.equal(text.includes("Turn off air conditioners"), false);
  assert.equal(html.includes("Turn off air conditioners"), false);
  assert.equal(html.includes("visibility:hidden"), false);
  assert.match(html, /<span class="task-text">Leave every smoke alarm/);
  assert.match(html, /id="task-0"/);
});

test("answering the house question shows the heater item with the alarm warning", () => {
  const answers = app.resolveAnswers(travelLike.questions, { 8: true });
  const text = app.formatApplicableText(
    "Travel checklist",
    travelLike.questions,
    travelLike.tasks,
    answers
  );
  const html = app.renderTasks(travelLike.tasks, answers, {});
  assert.match(
    text,
    /Turn off air conditioners and heaters\. Leave smoke alarms and carbon monoxide alarms on and plugged in\./
  );
  assert.match(html, /<span class="task-text">Turn off air conditioners and heaters<\/span>/);
  assert.match(html, /aria-describedby="task-2-note"/);
  assert.match(html, /id="task-2-note"/);
  assert.match(html, /id="task-2-note">Leave smoke alarms and carbon monoxide alarms on and plugged in\./);
  assert.match(html, /id="task-3-note">Do not unplug smoke alarms, carbon monoxide alarms, or the refrigerator\./);
  assert.equal(html.includes("<ul"), false);
});

test("question ids are not array positions", () => {
  const questions = [
    { id: 6, text: "Are there dirty dishes?" },
    { id: 1, text: "Are the dishes in the dishwasher clean?" },
  ];
  const tasks = [
    { questionsRequiredYes: [6], questionsAnyYes: [], task: "Brush off everything" },
    { questionsRequiredYes: [1], questionsAnyYes: [], task: "Put away the clean dishes" },
  ];
  const answers = { 6: true, 1: false };
  const names = app.applicableTasks(tasks, answers).map((item) => item.task.task);
  assert.deepEqual(names, ["Brush off everything"]);
  const html = app.renderQuestions(questions, answers);
  assert.match(html, /data-testid="answer-6-yes"/);
  assert.match(html, /id="question-6-yes"[^>]*checked/);
  assert.match(html, /<label for="question-6-yes">Yes<\/label>/);
});

test("any-yes, all-required, always, and missing fields", () => {
  assert.equal(
    app.taskApplies(
      { questionsRequiredYes: [], questionsAnyYes: [1, 2], task: "Check in" },
      { 1: false, 2: true }
    ),
    true
  );
  assert.equal(
    app.taskApplies(
      { questionsRequiredYes: [], questionsAnyYes: [1, 2], task: "Check in" },
      { 1: false, 2: false }
    ),
    false
  );
  assert.equal(
    app.taskApplies(
      { questionsRequiredYes: [1, 2], questionsAnyYes: [], task: "Both" },
      { 1: true, 2: true }
    ),
    true
  );
  assert.equal(
    app.taskApplies(
      { questionsRequiredYes: [1, 2], questionsAnyYes: [], task: "Both" },
      { 1: true, 2: false }
    ),
    false
  );
  assert.equal(app.taskApplies({ task: "Always" }, {}), true);
  assert.equal(
    app.taskApplies(
      { questionsRequiredYes: [1], questionsAnyYes: [2], task: "Either group" },
      { 1: false, 2: true }
    ),
    true
  );
});

test("URL answers override defaults and reject bad payloads", () => {
  const questions = [{ id: 1, text: "First?", default: true }];
  assert.equal(app.defaultAnswers(questions)[1], true);
  assert.equal(app.resolveAnswers(questions, null)[1], true);
  assert.equal(app.resolveAnswers(questions, { 1: false })[1], false);
  assert.deepEqual(app.parseAnswersParam(null), null);
  assert.deepEqual(app.parseAnswersParam(""), null);
  assert.deepEqual(app.parseAnswersParam('{"8":true}').value, { 8: true });
  assert.equal(app.parseAnswersParam("%7B%228%22%3Atrue%7D").value["8"], true);
  assert.ok(app.parseAnswersParam("[]").error);
  assert.ok(app.parseAnswersParam("null").error);
  assert.ok(app.parseAnswersParam("{bad").error);
  assert.deepEqual(app.parseDoneParam("[0,2]").value, { 0: true, 2: true });
  assert.ok(app.parseDoneParam('{"0":true}').error);
});

test("question and task text cannot inject HTML", () => {
  const questions = [{ id: 1, text: '<img src=x onerror="alert(1)">' }];
  const tasks = [
    {
      questionsRequiredYes: [],
      questionsAnyYes: [],
      task: '</script><script>alert(1)</script>',
      role: "<b>Me</b>",
      type: "Day",
    },
  ];
  const questionsHtml = app.renderQuestions(questions, { 1: false });
  const tasksHtml = app.renderTasks(tasks, { 1: false }, {});
  assert.equal(questionsHtml.includes("<img"), false);
  assert.match(questionsHtml, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.equal(tasksHtml.includes("<script>"), false);
  assert.match(tasksHtml, /&lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(tasksHtml, /class="task-role">&lt;b&gt;Me&lt;\/b&gt;<\/span>/);
});

test("summary counts hidden tasks", () => {
  const answers = app.defaultAnswers(travelLike.questions);
  assert.equal(
    app.summaryText(travelLike.tasks, answers),
    "2 of 4 tasks apply. 2 tasks are hidden because their conditions are not met."
  );
});

test("WebMCP tools validate input and skip registration without the API", () => {
  const opened = [];
  const state = {
    answers: app.defaultAnswers(travelLike.questions),
    done: {},
    confirmed: {},
  };
  const actions = {
    questions() {
      return travelLike.questions;
    },
    applicableItems() {
      return app.applicableTasks(travelLike.tasks, state.answers);
    },
    listApplicable() {
      return { count: app.applicableTasks(travelLike.tasks, state.answers).length };
    },
    isConfirmed(id) {
      return state.confirmed[id] === true;
    },
    answerWord(id) {
      return state.answers[id] === true ? "yes" : "no";
    },
    summary() {
      return app.summaryText(travelLike.tasks, state.answers);
    },
    isDone(index) {
      return state.done[index] === true;
    },
    applicableText() {
      return app.formatApplicableText(
        "Travel checklist",
        travelLike.questions,
        travelLike.tasks,
        state.answers
      );
    },
    showView(view) {
      state.view = view;
      return { view };
    },
    catalog() {
      return [
        {
          slug: "travel-checklist",
          title: "Travel checklist",
          url: "examples/travel-checklist/checklist.html",
        },
      ];
    },
    openChecklist(url) {
      opened.push(url);
      return { url };
    },
    applyAnswer(question, isYes) {
      state.answers[question.id] = isYes;
      state.confirmed[question.id] = true;
      return { questionId: question.id, answer: isYes ? "yes" : "no" };
    },
    applyCompleted(match, completed) {
      state.done[match.index] = completed;
      return { taskIndex: match.index, completed };
    },
  };
  const tools = Object.fromEntries(
    app.checklistToolDefinitions(actions).map((tool) => [tool.name, tool])
  );
  assert.deepEqual(Object.keys(tools), [
    "list-checklists",
    "open-checklist",
    "list-questions",
    "get-next-question",
    "set-question-answer",
    "list-applicable-tasks",
    "get-progress",
    "set-task-completed",
    "switch-view",
    "copy-applicable-items",
  ]);
  assert.equal(tools["list-applicable-tasks"].annotations.readOnlyHint, true);
  assert.equal(tools["get-progress"].annotations.readOnlyHint, true);
  assert.equal(tools["set-question-answer"].annotations.readOnlyHint, false);
  assert.equal(app.registerChecklistTools({}), false);
  assert.equal(tools["list-applicable-tasks"].execute({}, {}).count, 2);
  const first = tools["get-next-question"].execute({}, {});
  assert.equal(first.question.id, 8);
  assert.deepEqual(first.question.allowedAnswers, ["yes", "no"]);
  assert.equal(first.remaining, 2);
  assert.match(tools["set-question-answer"].execute({ questionId: 8, answer: "maybe" }, {}).error, /yes or no/);
  assert.equal(tools["set-question-answer"].execute({ questionId: 8, answer: "yes" }, {}).answer, "yes");
  assert.equal(tools["get-next-question"].execute({}, {}).question.id, 1);
  assert.equal(tools["list-questions"].execute({}, {}).questions[0].answer, "yes");
  const progress = tools["get-progress"].execute({}, {});
  assert.equal(progress.completed, 0);
  assert.equal(progress.remaining.some((item) => item.note.includes("Leave smoke alarms")), true);
  assert.match(tools["set-task-completed"].execute({ taskIndex: 2, completed: "yes" }, {}).error, /true or false/);
  assert.equal(tools["set-task-completed"].execute({ taskIndex: 2, completed: true }, {}).completed, true);
  assert.equal(tools["get-progress"].execute({}, {}).completed, 1);
  assert.match(
    tools["set-task-completed"].execute({ taskIndex: 99, completed: true }, {}).error,
    /not in the applicable list/
  );
  assert.equal(tools["switch-view"].execute({ view: "checklist" }, {}).view, "checklist");
  assert.match(tools["switch-view"].execute({ view: "nope" }, {}).error, /questions, roles, or checklist/);
  assert.match(tools["copy-applicable-items"].execute({}, {}).text, /Leave smoke alarms/);
  assert.equal(tools["list-checklists"].execute({}, {}).checklists[0].slug, "travel-checklist");
  assert.match(tools["open-checklist"].execute({ slug: "missing" }, {}).error, /No checklist/);
  assert.equal(
    tools["open-checklist"].execute({ slug: "travel-checklist" }, {}).url,
    opened[0]
  );
  const registered = [];
  const fakeDoc = {
    modelContext: {
      registerTool(tool, options) {
        registered.push({ name: tool.name, signal: options.signal });
        return Promise.resolve();
      },
    },
    defaultView: { addEventListener() {} },
  };
  assert.equal(app.registerChecklistTools(fakeDoc, actions), true);
  assert.equal(registered.length, 10);
  const indexTools = app.checklistToolDefinitions({
    catalog: actions.catalog,
    openChecklist: actions.openChecklist,
  });
  assert.deepEqual(
    indexTools.map((tool) => tool.name),
    ["list-checklists", "open-checklist"]
  );
  assert.equal(registered[0].signal.aborted, false);
});
