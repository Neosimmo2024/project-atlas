import Link from "next/link";
import { getTenantContext } from "@/repositories/tenant-context";
import { mailboxStatus } from "@/services/planet-mailbox";
import { MailboxConnection } from "@/components/mailbox-connection";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
export const dynamic = "force-dynamic";
export default async function MailboxPage() {
  const ctx = await getTenantContext();
  if (!ctx || !["owner", "admin"].includes(ctx.role)) return <div className="page"><h1>Accès non autorisé</h1></div>;
  const status = await mailboxStatus(ctx.tenantId);
  const { data } = await createSupabaseServiceRoleClient().from("timeline_events")
    .select("id,title,person_id,occurred_at,metadata").eq("tenant_id", ctx.tenantId)
    .contains("metadata", { reason: "candidate_reply" }).order("occurred_at", { ascending: false }).limit(30);
  return <div className="page stack"><h1>Réponses aux campagnes email</h1>
    <MailboxConnection initial={status} />
    <section className="card stack"><h2>Dernières réponses reçues</h2>
      {!(data?.length) && <p>Aucune réponse enregistrée pour le moment.</p>}
      {data?.map(event => <article key={event.id}>
        <h3>{event.metadata?.subject ?? event.title}</h3>
        <p>{event.metadata?.from} · {new Date(event.occurred_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{event.metadata?.reply_excerpt}</p>
        <Link href={`/people/${event.person_id}`}>Ouvrir la fiche</Link>
      </article>)}
    </section></div>;
}
