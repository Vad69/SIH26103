import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("write endpoints enforce Admin / PM / Member rules", async (t) => {
  const tmp = path.join(os.tmpdir(), `sih26103-${Date.now()}.db`);
  process.env.MONITOR_DB = tmp;
  const { app } = await import("./index.js");
  const server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.unlinkSync(tmp + suffix);
      } catch {
        /* ignore */
      }
    }
  });

  async function req(pathname, { method = "GET", token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  }

  async function login(email, password) {
    const res = await req("/api/auth/login", { method: "POST", body: { email, password } });
    assert.equal(res.status, 200, `login failed for ${email}`);
    return res.data.token;
  }

  const admin = await login("vardaan@mospi.gov.in", "vardaan123");
  const pm = await login("ishika@mospi.gov.in", "ishika123");
  const member = await login("disha@mospi.gov.in", "disha123");

  const created = await req("/api/projects", {
    method: "POST",
    token: admin,
    body: {
      name: "Admin-owned isolation check",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      original_cost: 10,
      revised_cost: 10,
      expenditure: 1,
    },
  });
  assert.equal(created.status, 201);
  const adminProjectId = created.data.id;

  const pmProjects = await req("/api/projects", { token: pm });
  assert.equal(pmProjects.status, 200);
  assert.equal(pmProjects.data.some((p) => p.id === adminProjectId), false);
  const ownId = pmProjects.data[0].id;

  const pmSteal = await req(`/api/projects/${adminProjectId}`, {
    method: "PUT",
    token: pm,
    body: { name: "hijack", status: "on_hold", start_date: "2026-01-01", end_date: "2026-12-31", original_cost: 10, revised_cost: 10, expenditure: 1 },
  });
  assert.equal(pmSteal.status, 403);

  const pmOwn = await req(`/api/projects/${ownId}`, {
    method: "PUT",
    token: pm,
    body: {
      name: pmProjects.data[0].name,
      start_date: pmProjects.data[0].start_date,
      end_date: pmProjects.data[0].end_date,
      status: "active",
      original_cost: 186,
      revised_cost: 214,
      expenditure: 97,
      delay_notes: "audit",
    },
  });
  assert.equal(pmOwn.status, 200);

  const pmUsers = await req("/api/users", {
    method: "POST",
    token: pm,
    body: { name: "Nope", email: "nope@mospi.gov.in", password: "secret12", role: "team_member" },
  });
  assert.equal(pmUsers.status, 403);

  const secondAdmin = await req("/api/users", {
    method: "POST",
    token: admin,
    body: { name: "Second", email: "second-admin@mospi.gov.in", password: "secret12", role: "admin" },
  });
  assert.equal(secondAdmin.status, 403);

  const memberWrite = await req(`/api/projects/${ownId}`, {
    method: "PUT",
    token: member,
    body: { name: "should fail", start_date: "2026-01-01", end_date: "2026-12-31", original_cost: 1, revised_cost: 1, expenditure: 0 },
  });
  assert.equal(memberWrite.status, 403);

  const memberTask = await req("/api/tasks/1", {
    method: "PUT",
    token: member,
    body: { status: "done", progress: 100 },
  });
  assert.equal(memberTask.status, 403);

  const memberCreate = await req("/api/projects", {
    method: "POST",
    token: member,
    body: { name: "Member project", start_date: "2026-01-01", end_date: "2026-12-31" },
  });
  assert.equal(memberCreate.status, 403);

  const badFinance = await req(`/api/projects/${ownId}`, {
    method: "PUT",
    token: admin,
    body: {
      name: "x",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
      original_cost: 10,
      revised_cost: 10,
      expenditure: 99,
    },
  });
  assert.equal(badFinance.status, 400);

  const memberPrecon = await req(`/api/projects/${ownId}/preconstructions`, {
    method: "POST",
    token: member,
    body: { name: "EC", category: "environmental_clearance" },
  });
  assert.equal(memberPrecon.status, 403);

  const memberQuick = await req(`/api/projects/${ownId}/quick-update`, {
    method: "POST",
    token: member,
    body: { blocker: "no funds released this month" },
  });
  assert.equal(memberQuick.status, 403);

  const adminPrecon = await req(`/api/projects/${ownId}/preconstructions`, {
    method: "POST",
    token: admin,
    body: { name: "Environmental Clearance", category: "environmental_clearance", status: "delayed", planned_completion: "2026-03-01" },
  });
  assert.equal(adminPrecon.status, 201);

  const nlp = await req("/api/nlp/classify", {
    method: "POST",
    token: admin,
    body: { text: "Environmental approval has not arrived and construction cannot proceed." },
  });
  assert.equal(nlp.status, 200);
  assert.equal(nlp.data.category, "environmental_clearance");

  const flash = await req("/api/reports/flash", { token: pm });
  assert.equal(flash.status, 200);
  assert.equal(flash.data.official, false);
  assert.ok(flash.data.projects.every((p) => p.id !== adminProjectId));

  const pdf = await req("/api/reports/flash.pdf", { token: admin });
  assert.equal(pdf.status, 200);

  const detail = await req(`/api/projects/${ownId}`, { token: pm });
  assert.equal(detail.status, 200);
  assert.ok(detail.data.lifecycle_stages?.length >= 11);
  assert.ok(detail.data.resources?.length >= 5);

  const memberLife = await req(`/api/projects/${ownId}/lifecycle/tender`, {
    method: "PUT",
    token: member,
    body: { status: "delayed" },
  });
  assert.equal(memberLife.status, 403);

  const badLife = await req(`/api/projects/${ownId}/lifecycle/tender`, {
    method: "PUT",
    token: pm,
    body: { status: "nope" },
  });
  assert.equal(badLife.status, 400);

  const life = await req(`/api/projects/${ownId}/lifecycle/tender`, {
    method: "PUT",
    token: pm,
    body: { status: "delayed", delay_reason: "Retender", planned_date: "2026-04-01" },
  });
  assert.equal(life.status, 200);
  assert.equal(life.data.lifecycle_stages.find((s) => s.stage_key === "tender").status, "delayed");

  const materials = await req(`/api/projects/${ownId}/resources/materials`, {
    method: "PUT",
    token: pm,
    body: { status: "blocked", delay_reason: "Supplier delivery delay" },
  });
  assert.equal(materials.status, 200);

  const commence = await req(`/api/projects/${ownId}`, {
    method: "PUT",
    token: pm,
    body: {
      name: life.data.name,
      start_date: life.data.start_date,
      end_date: life.data.end_date,
      status: life.data.status,
      original_cost: life.data.original_cost || 10,
      revised_cost: life.data.revised_cost || 10,
      expenditure: life.data.expenditure || 1,
      planned_commencement_date: "2026-01-10",
      actual_commencement_date: "2026-02-02",
    },
  });
  assert.equal(commence.status, 200);
  assert.equal(commence.data.commencement_delay_days, 23);
  const after = await req(`/api/projects/${ownId}`, { token: pm });
  assert.ok((after.data.audit || []).some((a) => /lifecycle|resource|updated project/i.test(a.action)));

  const dash = await req("/api/dashboard", { token: admin });
  assert.ok(dash.data.lifecycle_snapshot?.by_stage);
  assert.ok(flash.data.projects[0].lifecycle_stage !== undefined);
});
