import test from "node:test";
import assert from "node:assert/strict";
import { assertCanDeleteUser, normalizeCreatableRole, canWriteProjects } from "./rbac.js";

test("user-management form cannot create an Admin", () => {
  const blocked = normalizeCreatableRole("admin");
  assert.equal(blocked.ok, false);
  assert.match(blocked.error, /second Admin/i);
  assert.equal(normalizeCreatableRole("project_manager").ok, true);
  assert.equal(normalizeCreatableRole("team_member").ok, true);
});

test("only admin can delete members or managers", () => {
  const admin = { id: 1, role: "admin" };
  const pm = { id: 2, role: "project_manager" };
  const member = { id: 3, role: "team_member" };
  assert.equal(assertCanDeleteUser(admin, pm).ok, true);
  assert.equal(assertCanDeleteUser(pm, member).ok, false);
  assert.equal(assertCanDeleteUser(admin, admin).status, 403);
});

test("members cannot write projects", () => {
  assert.equal(canWriteProjects({ role: "team_member" }), false);
  assert.equal(canWriteProjects({ role: "project_manager" }), true);
  assert.equal(canWriteProjects({ role: "admin" }), true);
});
