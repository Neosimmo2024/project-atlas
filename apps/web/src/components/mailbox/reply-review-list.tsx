import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { suggestReply } from "@/features/mailbox/reply-draft";
import { ReplyReview } from "./reply-review";
export async function ReplyReviewList({ tenantId, personId }: { tenantId: string; personId: string }) {
  const db = createSupabaseServiceRoleClient();
  const { data, error } = await db.from("tasks").select("id,description,metadata")
    .eq("tenant_id", tenantId).eq("person_id", personId).is("deleted_at", null)
    .contains("metadata", { source: "recruitment_candidate_reply" }).order("created_at", { ascending: false }).limit(10);
  if (error) return <section className="card"><p>Les réponses sont temporairement indisponibles.</p></section>;
  if (!data?.length) return null;
  const sequences = await db.from("recruitment_email_sequences").select("id,email").eq("tenant_id", tenantId).eq("person_id", personId);
  if (sequences.error) return <p>Destinataires indisponibles.</p>;
  return <section className="stack" id="replies"><h2>Réponses reçues et brouillons</h2>
    <p>Les relances de ce contact sont arrêtées. Chaque réponse nécessite votre validation.</p>
    {data.map(task => {
      const meta = task.metadata as Record<string, unknown>;
      const email = sequences.data?.find(sequence => sequence.id === meta.sequence_id)?.email;
      if (!email) return null;
      const incoming = task.description?.replace(/^Réponse reçue\s*:\s*/, "") ?? "Message reçu sans contenu.";
      return <ReplyReview key={task.id} taskId={task.id} email={email} incoming={incoming}
        initialDraft={typeof meta.suggested_reply === "string" ? meta.suggested_reply : suggestReply(incoming)}
        initialRevision={Number(meta.reply_revision ?? 0)} initialStatus={String(meta.reply_status ?? "draft")} />;
    })}
  </section>;
}
