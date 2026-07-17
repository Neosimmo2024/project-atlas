# Smart Tasks V1

## Objectif

Smart Tasks V1 gere les prochaines actions du tenant courant. Une tache peut etre creee manuellement ou depuis un contexte metier existant : personne, organisation, relation ou interaction.

Le module reste volontairement simple en V1 : pas de kanban, calendrier, automatisation, IA, notifications, recurrence ni templates.

## Modele de donnees

Table : `public.tasks`

Champs principaux :

- `id`
- `tenant_id`
- `title`
- `description`
- `status`
- `priority`
- `due_at`
- `completed_at`
- `assigned_to`
- `created_by`
- `person_id`
- `organization_id`
- `relationship_id`
- `interaction_id`
- `source_type`
- `source_id`
- `reason`
- `metadata`
- `created_at`
- `updated_at`
- `deleted_at`

Statuts V1 :

- `todo`
- `in_progress`
- `waiting`
- `completed`
- `cancelled`

Priorites V1 :

- `low`
- `normal`
- `high`
- `critical`

## Regles metier

- `tenant_id` est impose cote serveur depuis la session active.
- Le navigateur ne peut pas choisir librement `tenant_id`.
- La suppression est logique via `deleted_at`.
- Une tache terminee a toujours `completed_at` renseigne.
- Une tache non terminee a `completed_at` a `null`.
- `source_type` et `source_id` doivent etre renseignes ensemble.
- Les references vers People, Organizations, Relationships et Interactions sont verifiees cote serveur dans le tenant courant.
- Les champs `metadata`, `source_type` et `source_id` preparent les evolutions futures sans automatisation V1.

## API

### `GET /api/tasks`

Retourne les taches du tenant courant avec pagination.

Parametres :

- `query`
- `status`
- `priority`
- `due`
- `personId`
- `organizationId`
- `relationshipId`
- `interactionId`
- `page`
- `pageSize`

Filtres `due` :

- `overdue`
- `today`
- `week`

### `POST /api/tasks`

Cree une tache. Le payload est valide par Zod. `tenant_id` et `created_by` viennent de la session serveur.

### `PUT /api/tasks/[id]`

Met a jour une tache du tenant courant. Sert aussi aux actions rapides `terminer` et `rouvrir`.

### `DELETE /api/tasks/[id]`

Effectue un soft delete. Reserve aux roles `owner` et `admin`.

## Permissions et RLS

Policies Supabase :

- lecture : tout membre actif du tenant ;
- creation : `owner`, `admin`, `recruiter`, `manager` ;
- modification : `owner`, `admin`, `recruiter`, `manager` ;
- suppression SQL : `owner`, `admin`.

Les routes applicatives appliquent aussi les roles cote serveur pour la suppression.

## Interface

Pages :

- `/tasks`
- `/tasks/new`
- `/tasks/[id]`

Composants :

- `TaskForm`
- `TaskCard`
- `TaskList`
- `TaskFilters`
- `DeleteTaskButton`
- `TaskStatusButton`

Les fiches People, Organizations, Relationships et Interactions affichent les taches liees et proposent une creation pre-remplie.

## Evolutions V2 preparees

- vues kanban ;
- calendrier ;
- automatisations ;
- notifications ;
- recurrence ;
- templates ;
- creation automatique depuis un moteur d'evenements ;
- scoring ou priorisation IA.

Ces evolutions utiliseront les champs `metadata`, `source_type`, `source_id`, `due_at`, `assigned_to` et les references contextuelles existantes.
