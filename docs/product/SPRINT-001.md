# SPRINT-001 - Core Foundation

## Objectif

Obtenir une premiere application accessible en ligne avec authentification, multi-tenancy, RLS et gestion des personnes, organisations et relations.

## Duree cible

7 a 10 jours ouvres.

## Livrables

- depot GitHub operationnel ;
- projet Next.js deployable ;
- projet Supabase configure ;
- authentification Supabase ;
- tables `tenants`, `profiles`, `tenant_users`, `roles`, `people`, `organizations`, `relationships`, `audit_log` ;
- politiques RLS ;
- triggers `updated_at` ;
- pages Login, Dashboard, People, Organizations, Relationships ;
- repositories, services et types TypeScript ;
- preparation n8n/Brevo sans automatisation active ;
- README d'installation.

## Definition of Done

- un utilisateur peut se connecter ;
- chaque donnee metier appartient a un tenant ;
- aucune donnee n'est visible entre deux tenants ;
- creer et modifier une personne ;
- rattacher une organisation ;
- creer une relation de recrutement ;
- importer un CSV simple ;
- retrouver un contact par recherche ;
- journaliser les changements minimaux ;
- aucune donnee de test sensible en production.
