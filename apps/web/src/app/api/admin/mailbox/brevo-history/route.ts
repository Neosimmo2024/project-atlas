import { NextResponse } from "next/server";
import { getTenantContext } from "@/repositories/tenant-context";
import { verifyBrevoAccountBinding } from "@/services/brevo-account-binding";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx || !["owner", "admin"].includes(ctx.role) || ctx.tenantId !== "8e27b0ff-3f1a-41fa-8390-628c718723a2") return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
  try {
    const apiKey = process.env.BREVO_API_KEY;
    const binding = await verifyBrevoAccountBinding(ctx.tenantId, { enabled: true, accountTenantId: ctx.tenantId, expectedOrganizationId: "69aae9fea303e8f4220b4e98", apiKey });
    if (binding.status !== "verified") throw new Error("binding");
    const read = async (path: string) => {
      const response = await fetch(`https://api.brevo.com/v3/${path}`, { headers: { "api-key": apiKey!, accept: "application/json" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("report");
      return response.json();
    };
    const [events, campaigns] = await Promise.all([read("smtp/statistics/events?days=90&event=delivered&limit=5000&sort=desc"), read("emailCampaigns?status=sent&limit=100&excludeHtmlContent=true")]);
    const rows = Array.isArray(events.events) ? events.events as Record<string, unknown>[] : [];
    return NextResponse.json({ transactional: { count: rows.length, lmdCount: rows.filter(row => /@lmdimmobilier\.fr$/i.test(String(row.email))).length,
      senderCounts: Object.fromEntries([...new Set(rows.map(row => String(row.from)))].map(from => [from, rows.filter(row => String(row.from) === from).length])),
      sample: rows.slice(0, 5), lmdSample: rows.filter(row => /@lmdimmobilier\.fr$/i.test(String(row.email))).slice(0, 5) },
      campaigns: (campaigns.campaigns ?? []).map((row: Record<string, unknown>) => ({ id: row.id, name: row.name, status: row.status, subject: row.subject,
        sentDate: row.sentDate, replyTo: row.replyTo, sender: row.sender, recipients: row.recipients, statistics: row.statistics })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Historique Brevo indisponible" }, { status: 503 }); }
}
