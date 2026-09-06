import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("GET and Member reads do not mutate reviews, alerts, or the PLFS seed baseline", async (t) => {
  const tmp = path.join(os.tmpdir(), `sih26103-readonly-get-${Date.now()}.db`);
  process.env.MONITOR_DB = tmp;
  const { app } = await import("./index.js");
  const { default: db } = await import("./db.js");
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
  const member = await login("disha@mospi.gov.in", "disha123");
  const plfs = db.prepare("SELECT id FROM projects WHERE name = ?").get("PLFS Digital Field Operations");
  assert.ok(plfs);

  function snapshot() {
    return {
      reviews: db.prepare("SELECT COUNT(*) AS n FROM project_reviews").get().n,
      alerts: db.prepare("SELECT COUNT(*) AS n FROM alerts").get().n,
      audit: db.prepare("SELECT COUNT(*) AS n FROM audit_log").get().n,
      stages: db.prepare("SELECT COUNT(*) AS n FROM lifecycle_stages").get().n,
      resources: db.prepare("SELECT COUNT(*) AS n FROM resource_readiness").get().n,
      plfsReviews: db
        .prepare("SELECT id, created_at, source, state_json FROM project_reviews WHERE project_id = ? ORDER BY id")
        .all(plfs.id),
      plfsHealth: db.prepare("SELECT health_score, health_band FROM projects WHERE id = ?").get(plfs.id),
    };
  }

  const before = snapshot();
  assert.equal(before.plfsReviews.length, 1);
  assert.equal(before.plfsReviews[0].source, "seed");
  const seedState = JSON.parse(before.plfsReviews[0].state_json);
  assert.equal(seedState.health_score, 72);
  assert.equal(seedState.health_band, "watch");

  const getPaths = [
    "/api/dashboard",
    "/api/projects",
    `/api/projects/${plfs.id}`,
    `/api/projects/${plfs.id}/what-changed`,
    `/api/projects/${plfs.id}/decision-timeline`,
    "/api/decision-board",
    "/api/briefing",
    "/api/alerts",
    "/api/reports",
    "/api/reports/flash",
    "/api/reports/qpisr",
    "/api/export/projects.csv",
    "/api/meta",
  ];

  for (const pathName of getPaths) {
    const res = await req(pathName, { token: admin });
    assert.equal(res.status, 200, `${pathName} should be 200`);
  }

  const afterAdminGets = snapshot();
  assert.deepEqual(afterAdminGets, before);

  for (let i = 0; i < 3; i += 1) {
    const again = await req(`/api/projects/${plfs.id}`, { token: admin });
    assert.equal(again.status, 200);
    assert.ok(again.data.insights?.health?.score != null);
    const wc = await req(`/api/projects/${plfs.id}/what-changed`, { token: admin });
    assert.equal(wc.status, 200);
    assert.equal(wc.data.available, true);
    assert.equal(wc.data.previous?.health_score, 72);
  }

  const memberGets = [
    "/api/dashboard",
    `/api/projects/${plfs.id}`,
    `/api/projects/${plfs.id}/what-changed`,
    "/api/decision-board",
    "/api/alerts",
  ];
  for (const pathName of memberGets) {
    const res = await req(pathName, { token: member });
    assert.equal(res.status, 200, `member ${pathName}`);
  }
  assert.deepEqual(snapshot(), before);

  const review = await req(`/api/projects/${plfs.id}/reviews`, { method: "POST", token: admin, body: {} });
  assert.equal(review.status, 201);
  const afterReview = snapshot();
  assert.equal(afterReview.reviews, before.reviews + 1);
  assert.equal(afterReview.plfsReviews[0].state_json, before.plfsReviews[0].state_json);

  const iv = await req(`/api/projects/${plfs.id}/interventions`, {
    method: "POST",
    token: admin,
    body: { action: "Readonly-get regression intervention", status: "open" },
  });
  assert.equal(iv.status, 201);
  const ivCount = db.prepare("SELECT COUNT(*) AS n FROM interventions WHERE project_id = ?").get(plfs.id).n;
  assert.ok(ivCount >= 1);

  const memberWrite = await req(`/api/projects/${plfs.id}/reviews`, { method: "POST", token: member, body: {} });
  assert.equal(memberWrite.status, 403);
});
