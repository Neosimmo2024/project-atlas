# Project Atlas

Project Atlas est le socle V1 d'un logiciel multi-tenant pour identifier, qualifier, contacter et suivre des talents immobiliers.

## Objectif V1

Construire une premiere application rentable centree sur le recrutement immobilier, puis etendre le socle a d'autres metiers.

## Stack V1

- Frontend et API : Next.js
- Base, authentification et stockage : Supabase / PostgreSQL
- Automatisations : n8n
- Emails et SMS : Brevo
- IA : OpenAI via une couche d'abstraction
- Hosting : Vercel
- Documentation et suivi : GitHub

## Structure

```txt
apps/web/              Application Next.js
docs/                  Produit, architecture et ADR
n8n/                   Preparation des workflows
supabase/migrations/   Schema PostgreSQL, RLS et triggers
```

## Installation

1. Installer Node.js 20+.
2. Creer un projet Supabase.
3. Copier `apps/web/.env.example` vers `apps/web/.env.local`.
4. Renseigner les variables Supabase.
5. Executer la migration SQL `supabase/migrations/0001_core.sql`.
6. Installer les dependances :

```bash
npm install
```

7. Demarrer l'application :

```bash
npm run dev
```

L'application est ensuite disponible sur `http://localhost:3000`.

## Bootstrap du premier tenant

La V1 est multi-tenant des le premier jour. Le premier utilisateur doit etre cree comme `owner` via une operation d'administration controlee apres creation du compte Supabase Auth :

1. Creer un tenant.
2. Creer le profil de l'utilisateur.
3. Rattacher l'utilisateur au tenant dans `tenant_users`.
4. Lui associer le role `owner`.

Les acces applicatifs reposent ensuite sur les politiques RLS.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
```

## Regles de securite

- Chaque donnee metier appartient obligatoirement a un tenant.
- Les politiques RLS empechent toute visibilite entre tenants.
- Aucun secret ne doit etre versionne.
- Les integrations Brevo et n8n sont preparees mais non developpees dans ce ticket.
