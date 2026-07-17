import type { InputHTMLAttributes } from "react";
import type { InteractionType } from "@/types/domain";

type InteractionFiltersProps = {
  query: string;
  typeId: string;
  types: Pick<InteractionType, "id" | "label">[];
};

export function InteractionFilters({ query, typeId, types }: InteractionFiltersProps) {
  return (
    <form className="filters interactions-filters" action="/interactions">
      <label>Recherche<InputLike name="query" defaultValue={query} placeholder="Titre, resume, lieu, commentaires" /></label>
      <label>
        Type
        <select className="input" name="typeId" defaultValue={typeId}>
          <option value="">Tous</option>
          {types.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
      </label>
      <button className="button" type="submit">Filtrer</button>
    </form>
  );
}

function InputLike(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}
