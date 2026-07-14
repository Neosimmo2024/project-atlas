import Link from "next/link";
import { PersonForm } from "@/components/people/person-form";

export default function NewPersonPage() {
  return (
    <div className="page stack">
      <header className="page-header">
        <div>
          <p className="muted">People</p>
          <h1>Nouvelle personne</h1>
        </div>
        <Link className="button subtle-button" href="/people">Retour</Link>
      </header>
      <section className="card">
        <PersonForm mode="create" />
      </section>
    </div>
  );
}
