import Link from "next/link";
import { PROJECT_STAGE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from "@/features/projects/options";
import { FilterBar, SearchInput } from "@/components/ui";
import type { ProjectOwnerOption } from "@/repositories/projects";
import type { ProjectStage, ProjectStatus, ProjectType } from "@/types/domain";

const statuses = Object.keys(PROJECT_STATUS_LABELS) as ProjectStatus[];
const stages = Object.keys(PROJECT_STAGE_LABELS) as ProjectStage[];
const types = Object.keys(PROJECT_TYPE_LABELS) as ProjectType[];

type ProjectFiltersProps = {
  query: string;
  status: string;
  stage: string;
  type: string;
  ownerId: string;
  organizationId: string;
  personId: string;
  relationshipId: string;
  expectedClose: string;
  includeArchived: boolean;
  ownerOptions: ProjectOwnerOption[];
};

export function ProjectFilters(props: ProjectFiltersProps) {
  return (
    <FilterBar action="/projects">
      <label>Recherche<SearchInput name="query" defaultValue={props.query} placeholder="Titre, description, note" /></label>
      <label>
        Statut
        <select className="input" name="status" defaultValue={props.status}>
          <option value="">Tous</option>
          {statuses.map((status) => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}
        </select>
      </label>
      <label>
        Etape
        <select className="input" name="stage" defaultValue={props.stage}>
          <option value="">Toutes</option>
          {stages.map((stage) => <option key={stage} value={stage}>{PROJECT_STAGE_LABELS[stage]}</option>)}
        </select>
      </label>
      <label>
        Type
        <select className="input" name="type" defaultValue={props.type}>
          <option value="">Tous</option>
          {types.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>)}
        </select>
      </label>
      <label>
        Responsable
        <select className="input" name="ownerId" defaultValue={props.ownerId}>
          <option value="">Tous</option>
          {props.ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
        </select>
      </label>
      <details className="card stack">
        <summary>Plus de filtres</summary>
        <div className="form-grid">
          <label>Organisation<input className="input" name="organizationId" defaultValue={props.organizationId} /></label>
          <label>Personne<input className="input" name="personId" defaultValue={props.personId} /></label>
          <label>Relation<input className="input" name="relationshipId" defaultValue={props.relationshipId} /></label>
          <label>Date de cloture prevue<input className="input" type="date" name="expectedClose" defaultValue={props.expectedClose} /></label>
          <label className="checkbox-label"><input type="checkbox" name="includeArchived" value="true" defaultChecked={props.includeArchived} /> Afficher les archives</label>
        </div>
      </details>
      <button className="button" type="submit">Filtrer</button>
      <Link className="button subtle-button" href="/projects">Reinitialiser</Link>
    </FilterBar>
  );
}
