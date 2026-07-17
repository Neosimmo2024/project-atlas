import type { InputHTMLAttributes } from "react";
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from "@/features/tasks/options";

type TaskFiltersProps = {
  query: string;
  status: string;
  priority: string;
  due: string;
};

export function TaskFilters({ query, status, priority, due }: TaskFiltersProps) {
  return (
    <form className="filters task-filters" action="/tasks">
      <label>Recherche<InputLike name="query" defaultValue={query} placeholder="Titre, description, raison" /></label>
      <label>
        Statut
        <select className="input" name="status" defaultValue={status}>
          <option value="">Tous</option>
          {TASK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        Priorite
        <select className="input" name="priority" defaultValue={priority}>
          <option value="">Toutes</option>
          {TASK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        Echeance
        <select className="input" name="due" defaultValue={due}>
          <option value="">Toutes</option>
          <option value="overdue">En retard</option>
          <option value="today">Aujourd&apos;hui</option>
          <option value="week">Cette semaine</option>
        </select>
      </label>
      <button className="button" type="submit">Filtrer</button>
    </form>
  );
}

function InputLike(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="input" />;
}
