import bcrypt from "bcryptjs";
import db from "./db.js";
import { ensureLifecycle } from "./lifecycle.js";

export const DEMO_USERS = [
  {
    name: "Vardaan",
    email: "vardaan@mospi.gov.in",
    password: "vardaan123",
    role: "admin",
  },
  {
    name: "Ishika Basu",
    email: "ishika@mospi.gov.in",
    password: "ishika123",
    role: "project_manager",
  },
  {
    name: "Disha Ghosh",
    email: "disha@mospi.gov.in",
    password: "disha123",
    role: "team_member",
  },
];

function hash(password) {
  return bcrypt.hashSync(password, 10);
}

function remapLegacyDemoAccounts() {
  const legacy = [
    { from: "admin@mospi.gov.in", to: DEMO_USERS[0] },
    { from: "pm@mospi.gov.in", to: DEMO_USERS[1] },
    { from: "member@mospi.gov.in", to: DEMO_USERS[2] },
  ];
  const update = db.prepare(
    "UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE lower(email) = ?"
  );
  for (const row of legacy) {
    const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(row.from);
    const taken = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(row.to.email);
    if (existing && !taken) {
      update.run(row.to.name, row.to.email, hash(row.to.password), row.to.role, row.from);
    }
  }
}

function enforceSingleAdmin() {
  const admins = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id").all();
  for (const extra of admins.slice(1)) {
    db.prepare("UPDATE users SET role = 'team_member' WHERE id = ?").run(extra.id);
  }
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id").get();
  if (admin && admin.email !== DEMO_USERS[0].email && admin.email === "admin@mospi.gov.in") {
    db.prepare("UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?").run(
      DEMO_USERS[0].name,
      DEMO_USERS[0].email,
      hash(DEMO_USERS[0].password),
      admin.id
    );
  }
}

function seedProjects(ids) {
  const insertProject = db.prepare(
    `INSERT INTO projects (name, description, start_date, end_date, status, manager_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const addMember = db.prepare(
    "INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)"
  );
  const insertMilestone = db.prepare(
    "INSERT INTO milestones (project_id, title, due_date, status) VALUES (?, ?, ?, ?)"
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (project_id, milestone_id, title, description, assignee_id, due_date, status, priority, progress, wbs_group)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const ishika = ids["ishika@mospi.gov.in"];
  const disha = ids["disha@mospi.gov.in"];

  const p1 = insertProject.run(
    "PLFS Digital Field Operations",
    "Digitise Periodic Labour Force Survey field capture, validation, and state-wise monitoring for MoSPI.",
    "2026-01-15",
    "2026-09-30",
    "active",
    ishika
  ).lastInsertRowid;

  const p2 = insertProject.run(
    "CPI Data Pipeline Modernisation",
    "Replace manual CPI compilation steps with a monitored pipeline, including quality gates and delayed-activity alerts.",
    "2025-11-01",
    "2026-06-30",
    "active",
    ishika
  ).lastInsertRowid;

  const p3 = insertProject.run(
    "NSS Sample Frame Refresh",
    "Update the national sample frame and publish a completion dashboard for survey operations.",
    "2025-08-01",
    "2026-03-31",
    "active",
    ishika
  ).lastInsertRowid;

  const p4 = insertProject.run(
    "e-Sankhyiki Portal Hardening",
    "Security, accessibility, and reporting upgrades for the public statistics portal. Marked complete after UAT.",
    "2025-04-01",
    "2025-12-15",
    "completed",
    ishika
  ).lastInsertRowid;

  for (const pid of [p1, p2, p3, p4]) {
    addMember.run(pid, ishika);
    addMember.run(pid, disha);
  }

  const m1a = insertMilestone.run(p1, "CAPI instrument freeze", "2026-03-31", "completed").lastInsertRowid;
  const m1b = insertMilestone.run(p1, "State training complete", "2026-05-15", "in_progress").lastInsertRowid;
  const m1c = insertMilestone.run(p1, "Live dashboard for supervisors", "2026-08-01", "pending").lastInsertRowid;

  insertTask.run(p1, m1a, "Finalise household questionnaire", "Lock CAPI form after cognitive testing.", disha, "2026-03-20", "done", "high", 100, "other");
  insertTask.run(p1, m1b, "Train master trainers — East zone", "Two-day workshop plus field shadowing.", disha, "2026-05-10", "in_progress", "critical", 55, "other");
  insertTask.run(p1, m1b, "Issue tablet inventory to states", "Asset tracking and SIM provisioning.", disha, "2026-04-30", "todo", "critical", 10, "procurement");
  insertTask.run(p1, m1b, "Lock enumerator attendance protocol", "Daily check-in so missing field days surface as delay risk.", disha, "2026-05-01", "todo", "critical", 0, "other");
  insertTask.run(p1, m1c, "Supervisor exception reports", "Overdue listing and non-response flags.", disha, "2026-07-15", "todo", "high", 5, "installation");
  insertTask.run(p1, m1c, "Role-based access for field staff", "PM / supervisor / enumerator roles.", disha, "2026-08-20", "todo", "medium", 0, "other");
  insertTask.run(p1, m1c, "State weekly delay digest", "Email supervisors a 7-day overdue list.", disha, "2026-09-08", "todo", "high", 15, "other");

  const m2a = insertMilestone.run(p2, "Source system inventory", "2026-01-15", "completed").lastInsertRowid;
  const m2b = insertMilestone.run(p2, "Quality-gate engine live", "2026-04-01", "in_progress").lastInsertRowid;
  const m2c = insertMilestone.run(p2, "Parallel run vs legacy", "2026-06-01", "pending").lastInsertRowid;

  insertTask.run(p2, m2a, "Catalogue CPI source files", "Document frequency, owner, and lag.", disha, "2026-01-10", "done", "medium", 100, "other");
  insertTask.run(p2, m2b, "Implement outlier detection rules", "Flag item-level shocks before aggregation.", disha, "2026-03-01", "in_progress", "critical", 40, "installation");
  insertTask.run(p2, m2b, "Delayed feed alerts", "Notify when a centre misses the cutoff.", disha, "2026-02-15", "todo", "critical", 15, "other");
  insertTask.run(p2, m2c, "Reconcile March index", "Compare pipeline output with published CPI.", disha, "2026-06-10", "todo", "high", 0, "testing");

  const m3a = insertMilestone.run(p3, "Urban frame update", "2026-01-31", "in_progress").lastInsertRowid;
  const m3b = insertMilestone.run(p3, "Rural PSU recoding", "2026-02-28", "pending").lastInsertRowid;

  insertTask.run(p3, m3a, "Merge census ward boundaries", "GIS join and duplicate check.", disha, "2026-01-20", "in_progress", "high", 60, "other");
  insertTask.run(p3, m3a, "Validate listing counts", "Compare against previous round.", disha, "2026-01-05", "todo", "critical", 20, "other");
  insertTask.run(p3, m3b, "Publish sampling note", "Methodology annex for the next NSS round.", disha, "2026-03-20", "todo", "medium", 0, "other");

  insertMilestone.run(p4, "UAT sign-off", "2025-11-30", "completed");
  insertTask.run(p4, null, "WCAG audit fixes", "Contrast and keyboard paths.", disha, "2025-10-15", "done", "medium", 100, "testing");
  insertTask.run(p4, null, "Load test public APIs", "Peak traffic around release day.", ishika, "2025-11-01", "done", "high", 100, "testing");
}

const PORTFOLIO = [
  {
    name: "PLFS Digital Field Operations",
    code: "MOSPI-PLFS-2026",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "All India / Multi-state",
    original_cost: 186,
    revised_cost: 214,
    expenditure: 97,
    original_end_date: "2026-09-30",
    revised_end_date: "2026-12-15",
    delay_reason: "procurement",
    delay_notes: "State tablet tenders slipped two cycles.",
    reported_physical_progress: 34,
    funds_released: 110,
    previous_health_band: "watch",
    preconstructions: [
      {
        name: "State tablet tender / contract approval",
        category: "procurement",
        status: "delayed",
        planned_completion: "2026-04-30",
        actual_completion: "",
        authority: "State DES",
        delay_reason: "procurement",
        remarks: "Two tender cycles slipped; inventory still incomplete.",
      },
      {
        name: "Field protocol statutory sign-off",
        category: "statutory",
        status: "in_progress",
        planned_completion: "2026-06-15",
        actual_completion: "",
        authority: "MoSPI",
        delay_reason: "",
        remarks: "",
      },
      {
        name: "Site / training-centre readiness (East zone)",
        category: "site_readiness",
        status: "blocked",
        planned_completion: "2026-05-01",
        actual_completion: "",
        authority: "State DES",
        delay_reason: "procurement",
        remarks: "Blocked until tablets arrive.",
      },
    ],
    issues: [
      {
        title: "Tablet inventory stuck in state procurement",
        category: "procurement",
        severity: "critical",
        owner: "MoSPI / State DES",
        intervention: "Joint review with state finance departments",
        due_date: "2026-09-30",
        status: "open",
      },
      {
        title: "Material delivery from supplier is delayed.",
        category: "equipment",
        severity: "high",
        owner: "State DES stores",
        intervention: "Escalate vendor SLA for tablet and SIM kits",
        due_date: "2026-09-18",
        status: "open",
      },
    ],
    interventions: [
      {
        action: "Convene state DES procurement cell; freeze a common rate contract",
        authority: "MoSPI",
        assigned_officer: "Ishika Basu",
        due_date: "2026-09-20",
        priority: "critical",
        status: "in_progress",
      },
    ],
  },
  {
    name: "CPI Data Pipeline Modernisation",
    code: "MOSPI-CPI-2025",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "All India / Multi-state",
    original_cost: 142,
    revised_cost: 168,
    expenditure: 88,
    original_end_date: "2026-06-30",
    revised_end_date: "2026-09-30",
    delay_reason: "coordination",
    delay_notes: "Centre feed SLAs not signed with two source ministries.",
    reported_physical_progress: 48,
    funds_released: 102,
    previous_health_band: "watch",
    preconstructions: [
      {
        name: "Inter-ministerial data-sharing approval",
        category: "statutory",
        status: "delayed",
        planned_completion: "2026-02-28",
        actual_completion: "",
        authority: "MoSPI CPI Division",
        delay_reason: "coordination",
        remarks: "SLA addendum still unsigned.",
      },
    ],
    issues: [
      {
        title: "Delayed centre feeds from two source agencies",
        category: "coordination",
        severity: "critical",
        owner: "MoSPI CPI Division",
        intervention: "Inter-ministerial data-sharing memo",
        due_date: "2026-09-15",
        status: "in_progress",
      },
    ],
    interventions: [
      {
        action: "Issue SLA addendum for delayed centres and stand up exception alerts",
        authority: "MoSPI",
        assigned_officer: "Ishika Basu",
        due_date: "2026-09-12",
        priority: "high",
        status: "open",
      },
    ],
  },
  {
    name: "NSS Sample Frame Refresh",
    code: "MOSPI-NSS-2025",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "All India / Multi-state",
    original_cost: 98,
    revised_cost: 112,
    expenditure: 41,
    original_end_date: "2026-03-31",
    revised_end_date: "2026-07-31",
    delay_reason: "land_acquisition",
    delay_notes: "Ward-boundary GIS join blocked where municipal layers are incomplete.",
    reported_physical_progress: 40,
    funds_released: 52,
    previous_health_band: "at_risk",
    preconstructions: [
      {
        name: "Municipal ward-layer access (three states)",
        category: "land_acquisition",
        status: "blocked",
        planned_completion: "2026-01-31",
        actual_completion: "",
        authority: "State DES / ULBs",
        delay_reason: "land_acquisition",
        remarks: "GIS layers incomplete.",
      },
    ],
    issues: [
      {
        title: "Municipal ward layers incomplete in three states",
        category: "land_acquisition",
        severity: "high",
        owner: "State DES / ULBs",
        intervention: "State-level GIS coordination",
        due_date: "2026-09-25",
        status: "open",
      },
    ],
    interventions: [],
  },
  {
    name: "e-Sankhyiki Portal Hardening",
    code: "MOSPI-ESANK-2025",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "Delhi",
    original_cost: 64,
    revised_cost: 64,
    expenditure: 64,
    original_end_date: "2025-12-15",
    revised_end_date: "2025-12-15",
    delay_reason: "",
    delay_notes: "",
    reported_physical_progress: 100,
    funds_released: 64,
    previous_health_band: "on_track",
    preconstructions: [
      {
        name: "Security / accessibility UAT sign-off",
        category: "statutory",
        status: "completed",
        planned_completion: "2025-11-30",
        actual_completion: "2025-11-30",
        authority: "MoSPI",
        delay_reason: "",
        remarks: "Completed with portal hardening.",
      },
    ],
    issues: [],
    interventions: [],
  },
];

function seedDecisionSupport() {
  const now = new Date().toISOString();
  const update = db.prepare(
    `UPDATE projects SET code=?, ministry=?, sector=?, state=?, original_cost=?, revised_cost=?, expenditure=?,
     original_end_date=?, revised_end_date=?, delay_reason=?, delay_notes=?, data_source='demo',
     reported_physical_progress=?, funds_released=?, previous_health_band=? WHERE name=?`
  );
  const insertIssue = db.prepare(
    `INSERT INTO issues (project_id, title, category, severity, owner, intervention, due_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertIv = db.prepare(
    `INSERT INTO interventions (project_id, issue_id, action, authority, assigned_officer, due_date, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of PORTFOLIO) {
    const project = db.prepare("SELECT * FROM projects WHERE name = ?").get(row.name);
    if (!project) continue;
    update.run(
      row.code,
      row.ministry,
      row.sector,
      row.state,
      row.original_cost,
      row.revised_cost,
      row.expenditure,
      row.original_end_date,
      row.revised_end_date,
      row.delay_reason,
      row.delay_notes,
      row.reported_physical_progress,
      row.funds_released ?? 0,
      row.previous_health_band,
      row.name
    );
    const issueCount = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE project_id = ?").get(project.id).n;
    if (issueCount === 0) {
      let firstIssueId = null;
      for (const issue of row.issues) {
        const info = insertIssue.run(
          project.id,
          issue.title,
          issue.category,
          issue.severity,
          issue.owner,
          issue.intervention,
          issue.due_date,
          issue.status,
          now
        );
        if (!firstIssueId) firstIssueId = info.lastInsertRowid;
      }
      if (firstIssueId) {
        for (const iv of row.interventions) {
          insertIv.run(
            project.id,
            firstIssueId,
            iv.action,
            iv.authority,
            iv.assigned_officer,
            iv.due_date,
            iv.priority,
            iv.status,
            now
          );
        }
      }
    }
    const preconCount = db.prepare("SELECT COUNT(*) AS n FROM preconstructions WHERE project_id = ?").get(project.id).n;
    if (preconCount === 0 && row.preconstructions) {
      const insertPre = db.prepare(
        `INSERT INTO preconstructions (project_id, name, category, status, planned_completion, actual_completion, authority, delay_reason, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const c of row.preconstructions) {
        insertPre.run(
          project.id,
          c.name,
          c.category,
          c.status,
          c.planned_completion || null,
          c.actual_completion || null,
          c.authority || "",
          c.delay_reason || "",
          c.remarks || ""
        );
      }
    }
  }
}

const LIFECYCLE_SPECS = [
  {
    name: "PLFS Digital Field Operations",
    meta: {
      tender_status: "delayed",
      tender_document_date: "2026-01-20",
      tender_publication_date: "2026-02-10",
      bid_deadline: "2026-03-15",
      evaluation_date: "2026-04-20",
      tender_award_date: "2026-05-05",
      contracting_agency: "Demo State DES procurement cell",
      tender_contract_value: 42,
      tender_remarks: "Two tender cycles slipped; award issued after re-tender.",
      tender_delay_reason: "Bid validity expired; retender required.",
      award_date: "2026-05-05",
      awarded_agency: "Demo field-ops consortium (seed record)",
      award_contract_value: 42,
      award_planned_commencement: "2026-05-20",
      award_remarks: "Awarded after delayed evaluation.",
      work_order_issued: 1,
      work_order_number: "WO-PLFS-DEMO-014",
      work_order_date: "2026-05-18",
      contract_reference: "AGR-PLFS-2026-D",
      executing_agency: "Demo field-ops consortium",
      wo_planned_commencement: "2026-05-20",
      wo_actual_commencement: "2026-06-12",
      work_order_remarks: "Work order issued; site kits lagged.",
      planned_commencement_date: "2026-05-20",
      actual_commencement_date: "2026-06-12",
      commencement_status: "completed",
      commencement_delay_reason: "Tablet kits not delivered",
      commencement_remarks: "23 days commencement delay",
      testing_status: "not_started",
      commissioning_status: "not_started",
      handover_status: "not_started",
      supervision_type: "departmental",
      supervising_org: "MoSPI survey operations (demo)",
      supervising_person: "Ishika Basu",
      supervision_start: "2026-01-15",
      supervision_remarks: "Departmental supervision of the prototype record.",
    },
    stages: [
      { key: "pre_construction", status: "delayed", planned: "2026-03-31", actual: "", delay: "Clearances still open", remarks: "Uses existing pre-construction records." },
      { key: "tender", status: "delayed", planned: "2026-04-15", actual: "2026-05-05", delay: "Retender", remarks: "Awarded after delay." },
      { key: "award", status: "completed", planned: "2026-04-30", actual: "2026-05-05", delay: "", remarks: "" },
      { key: "work_order", status: "completed", planned: "2026-05-10", actual: "2026-05-18", delay: "", remarks: "WO-PLFS-DEMO-014" },
      { key: "commencement", status: "completed", planned: "2026-05-20", actual: "2026-06-12", delay: "Kits late", remarks: "23 days commencement delay" },
      { key: "resource_mobilisation", status: "delayed", planned: "2026-06-01", actual: "", delay: "Supplier delivery delay", remarks: "Materials incomplete." },
      { key: "execution", status: "in_progress", planned: "2026-09-30", actual: "", delay: "", remarks: "Field capture in progress." },
    ],
    resources: [
      { category: "human_resources", status: "partial", remarks: "East-zone trainers not fully deployed" },
      { category: "materials", status: "delayed", delay: "Supplier delivery delay", remarks: "Tablet kits outstanding" },
      { category: "equipment", status: "delayed", delay: "SIM provisioning", remarks: "Linked to tablet tender" },
      { category: "logistics", status: "partial", remarks: "State despatch incomplete" },
      { category: "site_readiness", status: "blocked", delay: "Training centres", remarks: "Blocked until tablets arrive" },
    ],
  },
  {
    name: "CPI Data Pipeline Modernisation",
    meta: {
      tender_status: "awarded",
      tender_publication_date: "2025-11-20",
      tender_award_date: "2025-12-18",
      contracting_agency: "Demo NIC/MoSPI cell",
      tender_contract_value: 28,
      award_date: "2025-12-18",
      awarded_agency: "Demo pipeline integrator",
      award_contract_value: 28,
      award_planned_commencement: "2026-01-05",
      work_order_issued: 1,
      work_order_number: "WO-CPI-DEMO-007",
      work_order_date: "2025-12-28",
      executing_agency: "Demo pipeline integrator",
      planned_commencement_date: "2026-01-05",
      actual_commencement_date: "2026-01-28",
      commencement_status: "delayed",
      commencement_delay_reason: "Centre feed SLAs unsigned",
      commencement_remarks: "23 days commencement delay",
      testing_status: "not_started",
      commissioning_status: "not_started",
      handover_status: "not_started",
      supervision_type: "consultant",
      supervising_org: "Demo quality-gate consultant",
      supervising_person: "Ishika Basu",
    },
    stages: [
      { key: "pre_construction", status: "delayed", planned: "2026-02-28", actual: "", delay: "SLA addendum", remarks: "See clearance record." },
      { key: "tender", status: "completed", planned: "2025-12-15", actual: "2025-12-18", delay: "", remarks: "" },
      { key: "award", status: "completed", planned: "2025-12-18", actual: "2025-12-18", delay: "", remarks: "" },
      { key: "work_order", status: "completed", planned: "2025-12-28", actual: "2025-12-28", delay: "", remarks: "" },
      { key: "commencement", status: "delayed", planned: "2026-01-05", actual: "2026-01-28", delay: "SLA delay", remarks: "23 days commencement delay" },
      { key: "resource_mobilisation", status: "in_progress", planned: "2026-02-01", actual: "", delay: "", remarks: "" },
      { key: "execution", status: "in_progress", planned: "2026-06-30", actual: "", delay: "", remarks: "" },
    ],
    resources: [
      { category: "human_resources", status: "ready" },
      { category: "materials", status: "ready" },
      { category: "equipment", status: "partial", remarks: "Centre connectivity kits pending" },
      { category: "logistics", status: "ready" },
      { category: "site_readiness", status: "ready" },
    ],
  },
  {
    name: "NSS Sample Frame Refresh",
    meta: {
      tender_status: "document_preparation",
      tender_document_date: "2026-01-10",
      contracting_agency: "",
      planned_commencement_date: "2026-02-01",
      commencement_status: "not_started",
      supervision_type: "departmental",
      supervising_org: "MoSPI NSS division (demo)",
    },
    stages: [
      { key: "pre_construction", status: "blocked", planned: "2026-01-31", actual: "", delay: "Ward layers", remarks: "Canonical clearance records remain authoritative." },
      { key: "tender", status: "in_progress", planned: "2026-03-15", actual: "", delay: "", remarks: "Document preparation." },
    ],
    resources: [
      { category: "human_resources", status: "partial" },
      { category: "materials", status: "not_applicable" },
      { category: "equipment", status: "not_applicable" },
      { category: "logistics", status: "not_applicable" },
      { category: "site_readiness", status: "blocked", delay: "GIS layers", remarks: "Municipal layers incomplete" },
    ],
  },
  {
    name: "e-Sankhyiki Portal Hardening",
    meta: {
      tender_status: "awarded",
      tender_award_date: "2025-05-15",
      award_date: "2025-05-15",
      awarded_agency: "Demo portal hardening vendor",
      award_contract_value: 64,
      work_order_issued: 1,
      work_order_number: "WO-ESANK-DEMO-001",
      work_order_date: "2025-05-20",
      executing_agency: "Demo portal hardening vendor",
      planned_commencement_date: "2025-06-01",
      actual_commencement_date: "2025-06-01",
      commencement_status: "completed",
      testing_status: "completed",
      testing_planned: "2025-10-15",
      testing_actual: "2025-10-20",
      testing_remarks: "Load test and WCAG completed.",
      testing_issues: "",
      commissioning_status: "completed",
      commissioning_planned: "2025-11-15",
      commissioning_actual: "2025-11-20",
      commissioning_remarks: "UAT sign-off recorded.",
      commissioning_outstanding: "",
      handover_status: "completed",
      handover_planned: "2025-12-15",
      handover_actual: "2025-12-15",
      receiving_agency: "MoSPI web services (demo)",
      handover_remarks: "Handover complete on original date.",
      handover_defects: "",
      completion_certificate_status: "issued (demo)",
      supervision_type: "third_party_pmc",
      supervising_org: "Demo accessibility PMC",
      supervising_person: "Ishika Basu",
      supervision_start: "2025-04-01",
      supervision_end: "2025-12-15",
    },
    stages: [
      { key: "pre_construction", status: "completed", planned: "2025-05-01", actual: "2025-05-01", delay: "", remarks: "" },
      { key: "tender", status: "completed", planned: "2025-05-15", actual: "2025-05-15", delay: "", remarks: "" },
      { key: "award", status: "completed", planned: "2025-05-15", actual: "2025-05-15", delay: "", remarks: "" },
      { key: "work_order", status: "completed", planned: "2025-05-20", actual: "2025-05-20", delay: "", remarks: "" },
      { key: "commencement", status: "completed", planned: "2025-06-01", actual: "2025-06-01", delay: "", remarks: "" },
      { key: "resource_mobilisation", status: "completed", planned: "2025-06-15", actual: "2025-06-15", delay: "", remarks: "" },
      { key: "execution", status: "completed", planned: "2025-10-01", actual: "2025-10-01", delay: "", remarks: "" },
      { key: "testing", status: "completed", planned: "2025-10-15", actual: "2025-10-20", delay: "", remarks: "" },
      { key: "commissioning", status: "completed", planned: "2025-11-15", actual: "2025-11-20", delay: "", remarks: "" },
      { key: "completion", status: "completed", planned: "2025-12-15", actual: "2025-12-15", delay: "", remarks: "" },
      { key: "handover", status: "completed", planned: "2025-12-15", actual: "2025-12-15", delay: "", remarks: "Receiving agency recorded." },
    ],
    resources: [
      { category: "human_resources", status: "ready" },
      { category: "materials", status: "not_applicable" },
      { category: "equipment", status: "ready" },
      { category: "logistics", status: "ready" },
      { category: "site_readiness", status: "ready" },
    ],
  },
];

function seedLifecycleDemo() {
  const updStage = db.prepare(
    `UPDATE lifecycle_stages SET status=?, planned_date=?, actual_date=?, delay_reason=?, remarks=?
     WHERE project_id=? AND stage_key=?`
  );
  const updRes = db.prepare(
    `UPDATE resource_readiness SET status=?, delay_reason=?, remarks=? WHERE project_id=? AND category=?`
  );
  const metaSql = db.prepare(
    `UPDATE projects SET
      tender_status=?, tender_document_date=?, tender_publication_date=?, bid_deadline=?, evaluation_date=?, tender_award_date=?,
      contracting_agency=?, tender_contract_value=?, tender_remarks=?, tender_delay_reason=?,
      award_date=?, awarded_agency=?, award_contract_value=?, award_planned_commencement=?, award_remarks=?,
      work_order_issued=?, work_order_number=?, work_order_date=?, contract_reference=?, executing_agency=?,
      wo_planned_commencement=?, wo_actual_commencement=?, work_order_remarks=?,
      planned_commencement_date=?, actual_commencement_date=?, commencement_status=?, commencement_delay_reason=?, commencement_remarks=?,
      testing_status=?, testing_planned=?, testing_actual=?, testing_remarks=?, testing_issues=?,
      commissioning_status=?, commissioning_planned=?, commissioning_actual=?, commissioning_remarks=?, commissioning_outstanding=?,
      handover_status=?, handover_planned=?, handover_actual=?, receiving_agency=?, handover_remarks=?, handover_defects=?,
      completion_certificate_status=?,
      supervision_type=?, supervising_org=?, supervising_person=?, supervision_start=?, supervision_end=?, supervision_remarks=?
     WHERE id=?`
  );
  for (const spec of LIFECYCLE_SPECS) {
    const project = db.prepare("SELECT * FROM projects WHERE name = ?").get(spec.name);
    if (!project) continue;
    ensureLifecycle(db, project.id);
    const started = db.prepare(
      "SELECT COUNT(*) AS n FROM lifecycle_stages WHERE project_id = ? AND status != 'not_started'"
    ).get(project.id).n;
    if (started === 0) {
      for (const s of spec.stages) {
        updStage.run(s.status, s.planned || null, s.actual || null, s.delay || "", s.remarks || "", project.id, s.key);
      }
    }
    const resUsed = db.prepare(
      "SELECT COUNT(*) AS n FROM resource_readiness WHERE project_id = ? AND status != 'not_applicable'"
    ).get(project.id).n;
    if (resUsed === 0) {
      for (const r of spec.resources) {
        updRes.run(r.status, r.delay || "", r.remarks || "", project.id, r.category);
      }
    }
    if (!project.tender_status || project.tender_status === "not_started") {
      const m = spec.meta;
      metaSql.run(
        m.tender_status || "not_started",
        m.tender_document_date || null,
        m.tender_publication_date || null,
        m.bid_deadline || null,
        m.evaluation_date || null,
        m.tender_award_date || null,
        m.contracting_agency || "",
        m.tender_contract_value || 0,
        m.tender_remarks || "",
        m.tender_delay_reason || "",
        m.award_date || null,
        m.awarded_agency || "",
        m.award_contract_value || 0,
        m.award_planned_commencement || null,
        m.award_remarks || "",
        m.work_order_issued || 0,
        m.work_order_number || "",
        m.work_order_date || null,
        m.contract_reference || "",
        m.executing_agency || "",
        m.wo_planned_commencement || null,
        m.wo_actual_commencement || null,
        m.work_order_remarks || "",
        m.planned_commencement_date || null,
        m.actual_commencement_date || null,
        m.commencement_status || "not_started",
        m.commencement_delay_reason || "",
        m.commencement_remarks || "",
        m.testing_status || "not_started",
        m.testing_planned || null,
        m.testing_actual || null,
        m.testing_remarks || "",
        m.testing_issues || "",
        m.commissioning_status || "not_started",
        m.commissioning_planned || null,
        m.commissioning_actual || null,
        m.commissioning_remarks || "",
        m.commissioning_outstanding || "",
        m.handover_status || "not_started",
        m.handover_planned || null,
        m.handover_actual || null,
        m.receiving_agency || "",
        m.handover_remarks || "",
        m.handover_defects || "",
        m.completion_certificate_status || "",
        m.supervision_type || "",
        m.supervising_org || "",
        m.supervising_person || "",
        m.supervision_start || null,
        m.supervision_end || null,
        m.supervision_remarks || "",
        project.id
      );
    }
    const material = db
      .prepare("SELECT 1 AS n FROM issues WHERE project_id = ? AND title LIKE 'Material delivery%'")
      .get(project.id);
    if (!material && spec.name === "PLFS Digital Field Operations") {
      db.prepare(
        `INSERT INTO issues (project_id, title, category, severity, owner, intervention, due_date, status, created_at)
         VALUES (?, ?, 'equipment', 'high', 'State DES stores', 'Escalate vendor SLA for tablet and SIM kits', '2026-09-18', 'open', ?)`
      ).run(project.id, "Material delivery from supplier is delayed.", new Date().toISOString());
    }
  }
  db.prepare("UPDATE tasks SET wbs_group = 'procurement' WHERE title LIKE '%tablet inventory%' AND (wbs_group IS NULL OR wbs_group = '' OR wbs_group = 'other')").run();
  db.prepare("UPDATE tasks SET wbs_group = 'testing' WHERE title LIKE '%Load test%' OR title LIKE '%WCAG%'").run();
}

export function bootstrap() {
  remapLegacyDemoAccounts();
  enforceSingleAdmin();
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin
      ON users(role) WHERE role = 'admin';
  `);

  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return { seeded: false, migrated: true };

  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  const ids = {};
  for (const u of DEMO_USERS) {
    const info = insertUser.run(u.name, u.email, hash(u.password), u.role);
    ids[u.email] = info.lastInsertRowid;
  }
  seedProjects(ids);
  seedDecisionSupport();
  return { seeded: true };
}

export function seedIfEmpty() {
  const result = bootstrap();
  seedDecisionSupport();
  seedLifecycleDemo();
  return result;
}

if (process.argv[1]?.endsWith("seed.js")) {
  const result = seedIfEmpty();
  console.log(result.seeded ? "Database seeded." : "Database already has users; demo accounts remapped if needed.");
}
