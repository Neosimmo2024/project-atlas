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

Cette RPC est une surface transactionnelle interne. Elle n'est pas executable par `public`, `anon` ou `authenticated`, y compris pour les utilisateurs ayant un role Atlas `owner`, `admin`, `manager`, `recruiter` ou `reader`. La route serveur `/api/imports/csv/execute` valide d'abord la session Supabase, le tenant actif, le role Atlas et la previsualisation recalculee, puis appelle la RPC avec un client `service_role` strictement cote serveur.

La fonction SQL refuse tout appel dont le JWT PostgREST n'est pas `service_role`, puis reverifie explicitement que `p_actor_user_id` est actif dans le tenant et possede un role autorise. Le client ne peut donc pas choisir librement son tenant, son role ou une liste de Relationships a creer.

La cle `SUPABASE_SERVICE_ROLE_KEY` doit etre configuree uniquement dans l'environnement serveur. En CI locale Atlas, la meme surface est testee avec `QA_SUPABASE_SERVICE_ROLE_KEY`. Aucune de ces cles ne doit etre exposee au navigateur.

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

## Sprint 12

Sprint 12 ajoute l'option globale `Ajouter les contacts eligibles au pipeline de recrutement`.

L'option est inactive par defaut afin d'eviter une creation implicite de pipeline lors d'un import de nettoyage ou de simple enrichissement. Lorsqu'elle est activee, l'API conserve l'autorite: le client transmet uniquement le booleen global, jamais une liste de Relationships a creer.

## Relationships et Pipeline

Quand l'option Pipeline est activee, `public.execute_csv_import` cree ou rattache une Relationship uniquement si la ligne dispose d'une Person et d'une Organization accessibles dans le tenant.

Regles appliquees :

- type par defaut : `recruiting` ;
- phase initiale : `detection` ;
- statut initial : `active` ;
- responsable initial : aucun responsable attribue automatiquement ;
- aucune Relationship si l'organisation est absente ;
- aucune duplication si une Relationship `recruiting` active ou en pause existe deja pour la meme Person et la meme Organization ;
- une Relationship existante d'un autre type n'est pas modifiee ;
- aucune creation automatique d'organisation, de proprietaire ou de phase au-dela de ce que l'import CSV execute deja.

Chaque Relationship creee par l'import est tracee dans le rapport avec l'import, la ligne, le tenant, la Person, l'Organization, le type et la phase. Les Relationships preexistantes ou seulement rattachees sont marquees comme telles et ne sont jamais supprimables au titre de l'annulation de cet import.

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

L'annulation n'est pas un retour global de la base a un etat precedent. Elle ne supprime que les Relationships, People et Organizations explicitement creees par l'import, identifiees dans le rapport par `relationshipCreated`, `personCreated`, `organizationCreated`, `relationshipId`, `personId` et `organizationId`.

Les donnees seulement rattachees ne sont jamais supprimees. Les Relationships preexistantes sont donc conservees, meme si elles apparaissent comme rattachees dans le rapport.

Les Relationships creees par l'import sont analysees et supprimees avant le recalcul d'eligibilite des People et Organizations. Ce recalcul est obligatoire: une Person ou une Organization peut devenir supprimable apres la suppression d'une Relationship importee intacte.

Une Relationship creee par import est conservee si au moins une condition de securite existe :

- elle n'existe plus ;
- elle appartient a un autre tenant ;
- la trace ne correspond plus a la Person ou a l'Organization ;
- son type n'est plus `recruiting` ;
- sa phase n'est plus `detection` ;
- son statut n'est plus `active` ;
- son responsable a change ;
- son `updated_at` differe de son `created_at` ;
- une Task, Interaction, Project, Timeline ou evenement Pipeline la reference ;
- un autre import la reference ;
- PostgreSQL ou une regle metier empeche la suppression.

Une Person ou une Organization creee par import est conservee si au moins une condition de securite existe :

- elle n'existe plus ;
- elle appartient a un autre tenant ;
- son `updated_at` differe de son `created_at`, ce qui indique une modification posterieure ou une tracabilite insuffisante ;
- une Relationship, Task, Interaction, Project, Timeline, Action Plan ou organisation enfant la reference apres le recalcul ;
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
- import final Brevo, SMS, n8n ou automatisations commerciales.
