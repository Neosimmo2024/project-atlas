"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FilterBar, SearchInput } from "@/components/ui";
import { RECRUITMENT_PIPELINE_STAGES } from "@/features/recruitment-pipeline/options";
import { PIPELINE_STAGE_LABELS, type PipelineFilters } from "@/features/recruitment-pipeline/pipeline-ui";
import type { PipelineOwnerOption } from "@/repositories/recruitment-pipeline";

type PipelineFiltersProps = {
  filters: PipelineFilters;
  owners: PipelineOwnerOption[];
};

export function PipelineFilters({ filters, owners }: PipelineFiltersProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 761px)");
    setAdvancedOpen(query.matches);

    function syncAdvancedOpen(event: MediaQueryListEvent) {
      setAdvancedOpen(event.matches);
    }

    query.addEventListener("change", syncAdvancedOpen);
    return () => query.removeEventListener("change", syncAdvancedOpen);
  }, []);

  return (
    <FilterBar action="/pipeline" className="pipeline-filters" data-advanced-open={advancedOpen ? "true" : "false"}>
      <input type="hidden" name="view" value={filters.view} />
      <div className="pipeline-filter-primary">
        <label>Recherche<SearchInput name="query" defaultValue={filters.query} placeholder="Nom, organisation, notes" /></label>
        <button
          aria-controls="pipeline-advanced-filters"
          aria-expanded={advancedOpen}
          className="button subtle-button pipeline-filter-toggle"
          type="button"
          onClick={() => setAdvancedOpen((current) => !current)}
        >
          Filtres
        </button>
      </div>
      <div className="pipeline-filter-actions">
        <button className="button" type="submit">Filtrer</button>
        <Link className="button subtle-button" href="/pipeline">Réinitialiser</Link>
      </div>
      <div className="pipeline-filter-advanced" hidden={!advancedOpen} id="pipeline-advanced-filters">
        <label>Phase
          <select className="input" name="stage" defaultValue={filters.stage}>
            <option value="">Toutes</option>
            {RECRUITMENT_PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{PIPELINE_STAGE_LABELS[stage]}</option>)}
          </select>
        </label>
        <label>Responsable
          <select className="input" name="ownerId" defaultValue={filters.ownerId}>
            <option value="">Tous</option>
            {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.label}</option>)}
          </select>
        </label>
        <label>Actions
          <select className="input" name="nextAction" defaultValue={filters.nextAction}>
            <option value="">Toutes</option>
            <option value="overdue">En retard</option>
            <option value="today">Aujourd&apos;hui</option>
            <option value="none">Sans prochaine action</option>
          </select>
        </label>
        <label>Contact
          <select className="input" name="contact" defaultValue={filters.contact}>
            <option value="">Tous</option>
            <option value="blocked">Ne plus contacter</option>
            <option value="allowed">Contact autorisé</option>
          </select>
        </label>
        <label>Refus
          <select className="input" name="recontactable" defaultValue={filters.recontactable}>
            <option value="">Tous</option>
            <option value="yes">Recontactable</option>
            <option value="no">Non recontactable</option>
          </select>
        </label>
        <label>Par page
          <select className="input" name="pageSize" defaultValue={filters.pageSize}>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <label className="checks"><input type="checkbox" name="noOwner" value="true" defaultChecked={filters.noOwner} /> Sans responsable</label>
      </div>
    </FilterBar>
  );
}
