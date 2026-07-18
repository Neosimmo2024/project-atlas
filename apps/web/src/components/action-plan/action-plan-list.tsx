import { EmptyState } from "@/components/empty-state";
import { ActionPlanCard } from "./action-plan-card";
import type { ActionPlanItem } from "@/types/domain";

type ActionPlanListProps = {
  items: ActionPlanItem[];
};

export function ActionPlanList({ items }: ActionPlanListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Aucune action prioritaire"
        body="Atlas ne detecte aucune tache urgente ni relation a relancer pour cette organisation."
      />
    );
  }

  return (
    <div className="action-plan-list">
      {items.map((item) => <ActionPlanCard key={item.id} item={item} />)}
    </div>
  );
}
