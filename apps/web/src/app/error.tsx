"use client";

export default function ErrorPage() {
  return (
    <main role="alert">
      <h1>Impossible de charger cette page</h1>
      <p>Le chargement a échoué. Réessayez pour actualiser votre session et vos accès.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Réessayer
      </button>
    </main>
  );
}
