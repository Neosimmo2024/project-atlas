import type { Organization } from "@/types/domain";

type ActionPlanFiltersProps = {
  organizations: Pick<Organization, "id" | "name">[];
  selectedOrganizationId: string;
};

export function ActionPlanFilters({ organizations, selectedOrganizationId }: ActionPlanFiltersProps) {
  return (
    <form className="filters action-plan-filters" action="/action-plan">
      <label>
        Organisation
        <select className="input" name="organizationId" defaultValue={selectedOrganizationId}>
          {organizations.map((organization) => (
            <option key={organization.id} value={organization.id}>{organization.name}</option>
          ))}
        </select>
      </label>
      <button className="button" type="submit">Afficher</button>
    </form>
  );
}
