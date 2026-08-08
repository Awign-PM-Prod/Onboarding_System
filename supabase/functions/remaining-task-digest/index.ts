/**
 * Daily remaining-task digest for Program Managers and Payroll Leads.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Schedule: pg_cron → this function at 10:00 Asia/Kolkata (see migration).
 * Emails: via send-attendance-email (Resend).
 *
 * Manual:
 *   POST /functions/v1/remaining-task-digest
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Secrets: CRON_SECRET, FRONTEND_URL (plus RESEND_API_KEY on send-attendance-email).
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const JSON_HEADERS = { "Content-Type": "application/json" };
const PM_DECIDED = new Set(["APPROVED", "REJECTED", "CORRECTION_REQUESTED"]);
const JOINED_STATUSES = new Set(["JOINED", "JOINED_OTHER_DATE"]);
const MAIL_FN = "send-attendance-email";

type UserRow = { id: string; name: string; email: string; role: string };
type PmBucket = {
  client_id: string;
  client_name: string;
  awaiting_pm_review: number;
  pl_rejected: number;
  joining_today: number;
  joining_overdue: number;
  submission_pending: number;
  role_assigned: number;
};
type PlBucket = {
  client_id: string;
  client_name: string;
  pending_pl_review: number;
  missing_uan: number;
  unlock_pending: number;
};
type Digest = {
  user: UserRow;
  role: "PROGRAM_MANAGER" | "PAYROLL_LEAD";
  clients: Array<PmBucket | PlBucket>;
  dashboardUrl: string;
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function todayDateInIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function frontendBase() {
  const raw = String(Deno.env.get("FRONTEND_URL") ?? "http://localhost:8088").trim() ||
    "http://localhost:8088";
  return raw.replace(/\/+$/, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchInBatches<T>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: string[],
  applyFilters: (q: any) => any = (q) => q,
): Promise<T[]> {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (const batch of chunk(ids, 200)) {
    const query = applyFilters(supabase.from(table).select(select).in(column, batch));
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

function pmActionableTotal(b: PmBucket) {
  return b.awaiting_pm_review + b.pl_rejected + b.joining_today + b.joining_overdue;
}

function plActionableTotal(b: PlBucket) {
  return b.pending_pl_review + b.missing_uan + b.unlock_pending;
}

function emptyPmBucket(client: { id: string; client_name: string | null }): PmBucket {
  return {
    client_id: client.id,
    client_name: client.client_name || "Client",
    awaiting_pm_review: 0,
    pl_rejected: 0,
    joining_today: 0,
    joining_overdue: 0,
    submission_pending: 0,
    role_assigned: 0,
  };
}

function emptyPlBucket(client: { id: string; client_name: string | null }): PlBucket {
  return {
    client_id: client.id,
    client_name: client.client_name || "Client",
    pending_pl_review: 0,
    missing_uan: 0,
    unlock_pending: 0,
  };
}

function buildPmEmail(name: string, clients: PmBucket[], dashboardUrl: string) {
  const lines: string[] = [];
  const textLines = [
    `Hi ${name || "there"},`,
    "",
    "Here is your remaining onboarding work summary:",
    "",
  ];
  for (const c of clients) {
    const items: string[] = [];
    if (c.awaiting_pm_review) items.push(`${c.awaiting_pm_review} form(s) awaiting your review`);
    if (c.pl_rejected) items.push(`${c.pl_rejected} PL-rejected item(s) needing attention`);
    if (c.joining_today) items.push(`${c.joining_today} joining status due today`);
    if (c.joining_overdue) items.push(`${c.joining_overdue} joining status overdue`);
    if (c.submission_pending) {
      items.push(`${c.submission_pending} form submission(s) pending (employee)`);
    }
    if (c.role_assigned) items.push(`${c.role_assigned} role assigned — form not sent`);
    if (!items.length) continue;
    lines.push(
      `<p style="margin:16px 0 6px;font-weight:700;">${escapeHtml(c.client_name)}</p><ul style="margin:0 0 0 18px;padding:0;">${
        items.map((item) => `<li style="margin:4px 0;">${escapeHtml(item)}</li>`).join("")
      }</ul>`,
    );
    textLines.push(`${c.client_name}:`);
    for (const item of items) textLines.push(`  - ${item}`);
    textLines.push("");
  }
  textLines.push(`Open your dashboard: ${dashboardUrl}`, "", "- Team Awign");
  return {
    subject: "Awign — remaining onboarding tasks",
    html: [
      `<p>Hi ${escapeHtml(name || "there")},</p>`,
      "<p>Here is your remaining onboarding work summary:</p>",
      ...lines,
      `<p style="margin-top:20px;"><a href="${escapeHtml(dashboardUrl)}">Open PM dashboard</a></p>`,
    ].join("\n"),
    text: textLines.join("\n"),
  };
}

function buildPlEmail(name: string, clients: PlBucket[], dashboardUrl: string) {
  const lines: string[] = [];
  const textLines = [
    `Hi ${name || "there"},`,
    "",
    "Here is your remaining payroll work summary:",
    "",
  ];
  for (const c of clients) {
    const items: string[] = [];
    if (c.pending_pl_review) items.push(`${c.pending_pl_review} employee(s) awaiting PL review`);
    if (c.missing_uan) items.push(`${c.missing_uan} joined employee(s) missing UAN`);
    if (c.unlock_pending) items.push(`${c.unlock_pending} attendance unlock request(s) pending`);
    if (!items.length) continue;
    lines.push(
      `<p style="margin:16px 0 6px;font-weight:700;">${escapeHtml(c.client_name)}</p><ul style="margin:0 0 0 18px;padding:0;">${
        items.map((item) => `<li style="margin:4px 0;">${escapeHtml(item)}</li>`).join("")
      }</ul>`,
    );
    textLines.push(`${c.client_name}:`);
    for (const item of items) textLines.push(`  - ${item}`);
    textLines.push("");
  }
  textLines.push(`Open your dashboard: ${dashboardUrl}`, "", "- Team Awign");
  return {
    subject: "Awign — remaining payroll tasks",
    html: [
      `<p>Hi ${escapeHtml(name || "there")},</p>`,
      "<p>Here is your remaining payroll work summary:</p>",
      ...lines,
      `<p style="margin-top:20px;"><a href="${escapeHtml(dashboardUrl)}">Open payroll dashboard</a></p>`,
    ].join("\n"),
    text: textLines.join("\n"),
  };
}

async function buildPmDigests(
  supabase: SupabaseClient,
  users: UserRow[],
  todayIst: string,
): Promise<Digest[]> {
  const pmUsers = users.filter((u) => u.role === "PROGRAM_MANAGER");
  if (!pmUsers.length) return [];

  const clients = await fetchInBatches<{
    id: string;
    client_name: string | null;
    program_manager_id: string;
  }>(supabase, "clients", "id, client_name, program_manager_id", "program_manager_id", pmUsers.map((u) => u.id));
  if (!clients.length) return [];

  const clientIds = clients.map((c) => c.id);
  const employees = await fetchInBatches<{
    id: string;
    client_id: string;
    onboarding_initiated: boolean | null;
    onboarding_status: string | null;
    date_of_joining: string | null;
    joining_status: string | null;
  }>(
    supabase,
    "employees",
    "id, client_id, onboarding_initiated, onboarding_status, date_of_joining, joining_status",
    "client_id",
    clientIds,
  );
  const forms = await fetchInBatches<{
    employee_id: string;
    submission_status: string | null;
    review_status: string | null;
    payroll_review_status: string | null;
  }>(
    supabase,
    "job_app_form",
    "employee_id, submission_status, review_status, payroll_review_status",
    "employee_id",
    employees.map((e) => e.id),
  );
  const formMap = new Map(forms.map((f) => [f.employee_id, f]));

  const byPm = new Map<string, Map<string, PmBucket>>();
  for (const client of clients) {
    if (!byPm.has(client.program_manager_id)) byPm.set(client.program_manager_id, new Map());
    byPm.get(client.program_manager_id)!.set(client.id, emptyPmBucket(client));
  }
  const clientToPm = new Map(clients.map((c) => [c.id, c.program_manager_id]));

  for (const emp of employees) {
    const pmId = clientToPm.get(emp.client_id);
    const clientMap = pmId ? byPm.get(pmId) : undefined;
    const bucket = clientMap?.get(emp.client_id);
    if (!bucket) continue;

    const form = formMap.get(emp.id);
    const submissionStatus = String(form?.submission_status ?? "").trim();
    const reviewStatus = String(form?.review_status ?? "").trim().toUpperCase();
    const payrollReviewStatus = String(form?.payroll_review_status ?? "").trim();
    const onboardingStatus = String(emp.onboarding_status ?? "").trim().toUpperCase();

    if (submissionStatus === "Submitted" && !PM_DECIDED.has(reviewStatus)) {
      bucket.awaiting_pm_review += 1;
    }
    if (reviewStatus === "APPROVED" && payrollReviewStatus === "PAYROLL_REJECTED") {
      bucket.pl_rejected += 1;
    }
    if (emp.onboarding_initiated && submissionStatus !== "Submitted") {
      bucket.submission_pending += 1;
    }
    if (onboardingStatus === "ROLE_ASSIGNED") bucket.role_assigned += 1;

    const joining = String(emp.joining_status ?? "").trim();
    const doj = String(emp.date_of_joining ?? "").trim();
    if (!joining && doj && payrollReviewStatus === "PAYROLL_APPROVED") {
      if (doj === todayIst) bucket.joining_today += 1;
      else if (doj < todayIst) bucket.joining_overdue += 1;
    }
  }

  const digests: Digest[] = [];
  for (const user of pmUsers) {
    const clientMap = byPm.get(user.id);
    if (!clientMap) continue;
    const actionableClients = Array.from(clientMap.values())
      .filter((c) => pmActionableTotal(c) > 0)
      .sort((a, b) => a.client_name.localeCompare(b.client_name));
    if (!actionableClients.length) continue;
    digests.push({
      user,
      role: "PROGRAM_MANAGER",
      clients: actionableClients,
      dashboardUrl: `${frontendBase()}/pm-dashboard`,
    });
  }
  return digests;
}

async function buildPlDigests(supabase: SupabaseClient, users: UserRow[]): Promise<Digest[]> {
  const plUsers = users.filter((u) => u.role === "PAYROLL_LEAD");
  if (!plUsers.length) return [];

  const clients = await fetchInBatches<{
    id: string;
    client_name: string | null;
    created_by: string;
  }>(supabase, "clients", "id, client_name, created_by", "created_by", plUsers.map((u) => u.id));
  if (!clients.length) return [];

  const clientIds = clients.map((c) => c.id);
  const clientToPl = new Map(clients.map((c) => [c.id, c.created_by]));

  const employees = await fetchInBatches<{
    id: string;
    client_id: string;
    joining_status: string | null;
    payroll_pf_uan_number: string | null;
  }>(
    supabase,
    "employees",
    "id, client_id, joining_status, payroll_pf_uan_number",
    "client_id",
    clientIds,
  );
  const forms = await fetchInBatches<{
    employee_id: string;
    payroll_review_status: string | null;
  }>(
    supabase,
    "job_app_form",
    "employee_id, payroll_review_status",
    "employee_id",
    employees.map((e) => e.id),
  );
  const formMap = new Map(forms.map((f) => [f.employee_id, f]));

  const sheets = await fetchInBatches<{ id: string; client_id: string }>(
    supabase,
    "attendance_sheets",
    "id, client_id, unlock_request_status",
    "client_id",
    clientIds,
    (q) => q.eq("unlock_request_status", "PENDING"),
  );

  const byPl = new Map<string, Map<string, PlBucket>>();
  for (const client of clients) {
    if (!byPl.has(client.created_by)) byPl.set(client.created_by, new Map());
    byPl.get(client.created_by)!.set(client.id, emptyPlBucket(client));
  }

  for (const emp of employees) {
    const plId = clientToPl.get(emp.client_id);
    const bucket = plId ? byPl.get(plId)?.get(emp.client_id) : undefined;
    if (!bucket) continue;
    const form = formMap.get(emp.id);
    if (String(form?.payroll_review_status ?? "").trim() === "PENDING_PAYROLL_LEAD") {
      bucket.pending_pl_review += 1;
    }
    const joining = String(emp.joining_status ?? "").trim().toUpperCase();
    const uan = String(emp.payroll_pf_uan_number ?? "").trim();
    if (JOINED_STATUSES.has(joining) && !uan) bucket.missing_uan += 1;
  }

  for (const sheet of sheets) {
    const plId = clientToPl.get(sheet.client_id);
    const bucket = plId ? byPl.get(plId)?.get(sheet.client_id) : undefined;
    if (bucket) bucket.unlock_pending += 1;
  }

  const digests: Digest[] = [];
  for (const user of plUsers) {
    const clientMap = byPl.get(user.id);
    if (!clientMap) continue;
    const actionableClients = Array.from(clientMap.values())
      .filter((c) => plActionableTotal(c) > 0)
      .sort((a, b) => a.client_name.localeCompare(b.client_name));
    if (!actionableClients.length) continue;
    digests.push({
      user,
      role: "PAYROLL_LEAD",
      clients: actionableClients,
      dashboardUrl: `${frontendBase()}/dashboard`,
    });
  }
  return digests;
}

async function invokeMailer(args: {
  toEmail: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
}) {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return { skipped: true as const, reason: "missing_supabase_env" };
  }
  if (!args.toEmail) return { skipped: true as const, reason: "no_recipient" };

  const endpoint = `${supabaseUrl}/functions/v1/${MAIL_FN}`;
  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: args.subject,
        recipients: [{
          name: args.toName || "",
          email: args.toEmail,
          html: args.html,
          text: args.text,
        }],
      }),
    });
    const raw = await resp.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    if (!resp.ok) {
      return { ok: false as const, error: String(body?.error || `Edge failed (${resp.status})`) };
    }
    return { ok: true as const, body };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

function authorize(req: Request): Response | null {
  const expected = String(Deno.env.get("CRON_SECRET") ?? "").trim();
  if (!expected) {
    return json(503, { error: "CRON_SECRET is not configured." });
  }
  const header = String(req.headers.get("authorization") || "");
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? String(match[1] || "").trim() : "";
  if (!token || token !== expected) {
    return json(401, { error: "Unauthorized" });
  }
  return null;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const authError = authorize(req);
  if (authError) return authError;

  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, role")
      .in("role", ["PROGRAM_MANAGER", "PAYROLL_LEAD"]);
    if (error) throw error;

    const userRows = (users ?? []) as UserRow[];
    const todayIst = todayDateInIST();
    const [pmDigests, plDigests] = await Promise.all([
      buildPmDigests(supabase, userRows, todayIst),
      buildPlDigests(supabase, userRows),
    ]);
    const digests = [...pmDigests, ...plDigests];

    const summary = {
      sent: 0,
      skipped: 0,
      failed: 0,
      details: [] as Array<Record<string, unknown>>,
    };

    for (const digest of digests) {
      const email = digest.role === "PROGRAM_MANAGER"
        ? buildPmEmail(digest.user.name, digest.clients as PmBucket[], digest.dashboardUrl)
        : buildPlEmail(digest.user.name, digest.clients as PlBucket[], digest.dashboardUrl);

      const result = await invokeMailer({
        toEmail: digest.user.email,
        toName: digest.user.name,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });

      const detail = {
        user_id: digest.user.id,
        email: digest.user.email,
        role: digest.role,
        clients: digest.clients.length,
      };

      if ("skipped" in result && result.skipped) {
        summary.skipped += 1;
        summary.details.push({ ...detail, status: "skipped", reason: result.reason || "skipped" });
      } else if ("ok" in result && result.ok) {
        summary.sent += 1;
        summary.details.push({ ...detail, status: "sent" });
      } else {
        summary.failed += 1;
        summary.details.push({
          ...detail,
          status: "failed",
          error: ("error" in result && result.error) || "unknown",
        });
      }
    }

    const emailedIds = new Set(digests.map((d) => d.user.id));
    summary.skipped += userRows.filter((u) => !emailedIds.has(u.id)).length;

    console.log(
      `[remaining-task-digest] done sent=${summary.sent} failed=${summary.failed} empty_or_skipped=${summary.skipped}`,
    );
    return json(200, { ok: true, ...summary });
  } catch (err) {
    console.error("[remaining-task-digest] error", err);
    return json(500, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
