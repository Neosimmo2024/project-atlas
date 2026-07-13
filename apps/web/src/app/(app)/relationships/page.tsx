import { EmptyState } from "@/components/empty-state";
import { listRelationships } from "@/repositories/relationships";
import { getTenantContext } from "@/repositories/tenant-context";

export default async function RelationshipsPage() {
  const context = await getTenantContext();
  const relationships = context ? await listRelationships(context) : [];
  return (
    <div className="page stack">
      <header><p className="muted">Recruiting pipeline</p><h1>Relationships</h1></header>
      {relationships.length === 0 ? <EmptyState title="Aucune relation" body="Les relations de recrutement seront suivies ici." /> : (
        <div className="table">{relationships.map((relationship) => <article key={relationship.id} className="row"><strong>{relationship.relationship_type}</strong><span>{relationship.phase}</span><span>{relationship.status}</span></article>)}</div>
      )}
    </div>
  );
}
