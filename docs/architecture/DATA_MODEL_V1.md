# Modele de donnees V1

## Tables systeme

- `tenants` : entites clientes.
- `profiles` : profil applicatif d'un utilisateur Supabase Auth.
- `roles` : roles applicatifs (`owner`, `admin`, `recruiter`, `manager`, `reader`).
- `tenant_users` : rattachement utilisateur/tenant/role.
- `audit_log` : journal minimal des changements.

## Tables metier

- `people` : talents et contacts.
- `organizations` : entreprises, agences, reseaux ou structures.
- `relationships` : relation de recrutement entre une personne et une organisation.
- `interactions` et `interaction_types` : echanges rattaches aux personnes, organisations, relations ou projets.
- `tasks` : taches contextualisees, avec soft delete.
- `timeline_events` : chronologie universelle tenant-scoped.
- `projects` : projets metier rattaches aux entites existantes.
- `action_plan_decisions` : decisions utilisateur sur les recommandations du Plan d'action.
- `recruitment_pipeline_events` : historique append-only des transitions Pipeline.
- `csv_import_runs` et `csv_import_cancellations` : historique et annulation securisee des imports CSV.

## Deduplication V1

Ordre de priorite :

1. email normalise ;
2. telephone normalise ;
3. prenom + nom + ville.

## Import CSV et TVA

Le parcours CSV V1 couvre la previsualisation, le mapping, la normalisation, la detection des doublons, l'execution transactionnelle, l'historique, l'annulation securisee et l'option globale CSV -> Pipeline.

`organizations.vat_status` est facultatif et contraint par CHECK :

- `assujetti` ;
- `non_assujetti` ;
- `a_verifier`.

Le statut TVA n'est jamais bloquant pour l'import. Les valeurs inconnues sont classees `a_verifier` avec avertissement, et une Organization existante ayant deja un statut n'est pas ecrasee silencieusement.

## Contraintes

- Chaque donnee metier possede un `tenant_id`.
- Les statuts restent en `TEXT + CHECK CONSTRAINT`.
- Aucun `ENUM` PostgreSQL n'est utilise.
- Les triggers `updated_at` sont crees pour les tables mutables.
