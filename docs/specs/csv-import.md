# Import CSV

## Sprint 11D

L'import CSV execute uniquement les decisions validees apres la previsualisation, la correspondance de colonnes et la detection des doublons.

## Execution

- L'utilisateur confirme explicitement l'import avant toute ecriture.
- L'API `/api/imports/csv/execute` recalcule la previsualisation cote serveur avec le tenant authentifie.
- Le mapping, l'empreinte d'analyse et les decisions sont revalides avant l'appel SQL.
- Les droits autorises sont `owner`, `admin`, `recruiter` et `manager`.
- Le role `reader` ne peut pas executer un import.

## Transaction

L'execution finale passe par la fonction PostgreSQL `public.execute_csv_import`. Une fonction RPC est necessaire parce que les repositories Atlas existants effectuent des ecritures separees et ne peuvent pas garantir une transaction globale depuis le client Supabase.

La transaction couvre :

- la creation ou le rattachement des personnes ;
- la creation ou le rattachement des organisations ;
- l'enregistrement de l'historique `csv_import_runs` ;
- le rapport retourne a l'interface.

Si une erreur survient, PostgreSQL annule la transaction complete.

## Idempotence

La table `csv_import_runs` impose une unicite `(tenant_id, idempotency_key)`. Une repetition de la meme demande retourne le rapport existant avec `idempotent: true` au lieu de recreer des donnees.

La meme cle avec une empreinte d'analyse ou une empreinte de payload differente est refusee. La verification est faite dans PostgreSQL, apres la contrainte unique, afin de couvrir les doubles clics, les requetes simultanees et les reessais apres perte de reponse.

## Decisions

- `create_new` cree une personne et, si le nom d'organisation est present et sans cible existante, une organisation.
- `link_existing` verifie les cibles dans le tenant et n'ecrase aucune valeur existante.
- `ignore_row` ne modifie aucune donnee metier.
- `review_later` ne modifie aucune donnee metier.

Les lignes en conflit critique ou invalides ne peuvent pas etre creees. Les lignes invalides ignorees apparaissent comme refusees dans le rapport.

## Relationships

Sprint 11D ne cree pas automatiquement de Relationship. Le rapport expose `relationshipsCreated: 0`. La creation de relations CSV necessitera une decision explicite dans un sprint ulterieur si le modele d'import la prepare.

## Historique

`csv_import_runs` conserve :

- tenant ;
- utilisateur ;
- cle d'idempotence ;
- nom non sensible du fichier ;
- empreinte d'analyse ;
- empreinte technique du payload execute ;
- compteurs d'execution ;
- rapport JSON sans fichier CSV brut.

## Sprint 11E

Sprint 11E ajoute l'historique consultable des imports et une annulation securisee.

Les routes `/imports` et `/imports/[id]` permettent de consulter les imports du tenant, le rapport final, les lignes creees, les lignes rattachees, les lignes ignorees ou rejetees et l'etat d'annulation.

## Annulation securisee

L'annulation n'est pas un retour global de la base a un etat precedent. Elle ne supprime que les People et Organizations explicitement creees par l'import, identifiees dans le rapport 11D par `personCreated`, `organizationCreated`, `personId` et `organizationId`.

Les donnees seulement rattachees ne sont jamais supprimees. Sprint 11D ne cree aucune Relationship, donc Sprint 11E ne supprime aucune Relationship au titre d'un import CSV.

Une Person ou une Organization creee par import est conservee si au moins une condition de securite existe :

- elle n'existe plus ;
- elle appartient a un autre tenant ;
- son `updated_at` differe de son `created_at`, ce qui indique une modification posterieure ou une tracabilite insuffisante ;
- une Relationship, Task, Interaction, Project, Timeline, Action Plan ou organisation enfant la reference ;
- un autre import la reference ;
- PostgreSQL ou une regle metier empeche la suppression.

En cas de doute, Atlas conserve la donnee et indique le motif dans le rapport.

## Transaction et idempotence d'annulation

L'annulation finale passe par la fonction PostgreSQL `public.cancel_csv_import`. Elle est `SECURITY DEFINER` avec `search_path = public, pg_temp`.

La transaction couvre :

- la creation de l'historique `csv_import_cancellations` ;
- les suppressions autorisees ;
- les compteurs ;
- le rapport final ;
- le statut final.

La table `csv_import_cancellations` impose l'unicite `(tenant_id, import_run_id)` et `(tenant_id, idempotency_key)`. Une repetition legitime avec la meme cle retourne le meme rapport sans refaire les suppressions. Une meme cle utilisee pour un import different est refusee.

Les roles autorises pour l'annulation sont `owner` et `admin`. Le role `reader` est refuse. Les autres roles capables d'executer un import ne sont pas autorises a l'annuler en V1, car l'annulation est plus sensible.

Les utilisateurs authentifies peuvent lire l'historique de leur tenant via RLS. Ils ne peuvent pas inserer ou modifier directement `csv_import_cancellations`; l'etat est modifie uniquement par RPC.

## Retrocompatibilite

Les imports Sprint 11D sont annulables uniquement lorsque le rapport contient les identifiants de creation explicites. Si un ancien rapport annonce des creations sans IDs exploitables, Atlas le rend consultable mais refuse l'annulation automatique avec une tracabilite insuffisante.

## Hors Perimetre

Le sprint ne couvre pas :

- restauration arbitraire d'anciennes valeurs ;
- Brevo ;
- SMS ;
- n8n ;
- automatisations commerciales ;
- creation automatique de relations.
