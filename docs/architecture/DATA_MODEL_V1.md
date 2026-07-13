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

## Deduplication V1

Ordre de priorite :

1. email normalise ;
2. telephone normalise ;
3. prenom + nom + ville.

## Contraintes

- Chaque donnee metier possede un `tenant_id`.
- Les statuts restent en `TEXT + CHECK CONSTRAINT`.
- Aucun `ENUM` PostgreSQL n'est utilise.
- Les triggers `updated_at` sont crees pour les tables mutables.
