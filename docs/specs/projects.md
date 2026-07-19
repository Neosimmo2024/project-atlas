# Projets - Fondations Sprint 9A

## Objectif

Un Projet répond à la question : "Où en est cette démarche et quelle est la prochaine action à réaliser ?"

Le Sprint 9A livre les fondations techniques uniquement : modèle de données, repository, API, transitions métier, sécurité tenant, Timeline, rattachement des tâches et échanges. L'interface complète, le pipeline Kanban et les statistiques sont hors périmètre.

## Modèle de données

Table `projects` :

- `id`
- `tenant_id`
- `title`
- `short_description`
- `project_type`
- `status`
- `stage`
- `owner_user_id`
- `created_by`
- `organization_id`
- `person_id`
- `relationship_id`
- `estimated_value numeric(14,2)`
- `final_value numeric(14,2)`
- `currency`
- `expected_close_at`
- `won_at`
- `lost_at`
- `loss_reason`
- `closing_note`
- `archived_at`
- `metadata jsonb`
- `created_at`
- `updated_at`

Les valeurs financières utilisent `numeric(14,2)` côté PostgreSQL et sont transportées en chaînes côté TypeScript pour éviter les flottants imprécis.

## Référentiels

Types :

- `recruitment` : Recrutement
- `property_sale` : Vente immobilière
- `rental_management` : Gestion locative
- `partnership` : Partenariat
- `training` : Formation
- `referral` : Recommandation
- `other` : Autre

Statuts :

- `open` : Ouvert
- `won` : Gagné
- `lost` : Perdu

Étapes :

- `new` : Nouveau
- `qualification` : Qualification
- `proposal` : Proposition
- `decision` : Décision

## Rattachements

Un Projet peut être lié à une organisation, une personne ou une relation. Si une relation est fournie, le repository récupère automatiquement sa personne et son organisation lorsque ces valeurs ne sont pas fournies. Toute incohérence entre relation, personne et organisation est refusée.

Le responsable est obligatoire. Par défaut, le créateur devient responsable. Le responsable doit être un utilisateur actif du tenant.

Les tables `tasks`, `interactions` et `timeline_events` possèdent un `project_id` nullable. Le fonctionnement existant reste inchangé lorsqu'aucun Projet n'est lié.

## API

Endpoints livrés :

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `POST /api/projects/:id/win`
- `POST /api/projects/:id/lose`
- `POST /api/projects/:id/reopen`
- `POST /api/projects/:id/archive`
- `POST /api/projects/:id/reactivate`

Les filtres de liste supportés sont `organizationId`, `personId`, `relationshipId`, `ownerId`, `type`, `status`, `stage`, `query` et `includeArchived`.

## Transitions

Gagné :

- passe `status` à `won` ;
- conserve `stage` ;
- renseigne `won_at` ;
- renseigne `final_value` si fournie ;
- crée un événement Timeline ;
- ne ferme aucune tâche automatiquement.

Perdu :

- passe `status` à `lost` ;
- conserve `stage` ;
- exige `loss_reason` ;
- exige une note si le motif est `other` ;
- crée un événement Timeline ;
- ne supprime aucune tâche ni aucun échange.

Réouverture :

- passe `status` à `open` ;
- conserve l'historique ;
- nettoie `won_at`, `lost_at`, `loss_reason` et `final_value` ;
- ne supprime aucune donnée liée.

Archivage :

- renseigne `archived_at` ;
- masque le Projet des listes actives par défaut ;
- conserve la Timeline et les données liées.

Réactivation :

- remet `archived_at` à `null`.

## Prochaine action calculée

La prochaine action n'est jamais saisie manuellement. Elle est calculée depuis les tâches ouvertes du Projet :

1. tâche en retard la plus ancienne ;
2. tâche prévue aujourd'hui ;
3. prochaine tâche avec échéance ;
4. tâche prioritaire sans échéance ;
5. aucune prochaine action.

## Dernière activité calculée

La dernière activité utilise la source historique réelle : événements Timeline du Projet, avec fallback sur `projects.created_at`.

## Sécurité

La migration active RLS sur `projects` et ajoute des triggers de cohérence tenant pour :

- responsable autorisé ;
- personne du même tenant ;
- organisation du même tenant ;
- relation du même tenant et cohérente ;
- tâche rattachée à un Projet du même tenant ;
- échange rattaché à un Projet du même tenant.

Aucune route API n'accepte `tenant_id` depuis le navigateur.

## Décisions techniques

- Le mot produit reste "Projet".
- Le nom technique utilise `projects`, pas `opportunities`, car aucun modèle legacy ne nécessitait de conserver `opportunity`.
- Les montants restent en `numeric(14,2)` en base et en `string | null` en TypeScript.
- Le tri de liste est déterministe après enrichissement batch, sans limite globale arbitraire avant pagination.

## Hors périmètre Sprint 9A

- page complète des Projets ;
- formulaire visuel finalisé ;
- pipeline Kanban ;
- drag and drop ;
- statistiques ;
- automatisations Action Plan ciblant les Projets ;
- collaboration multi-utilisateur ;
- documents attachés.
