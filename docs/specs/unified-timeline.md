# Chronologie unifiee

## Objectif

La Chronologie unifiee centralise les evenements importants lies aux personnes, organisations et relations. Elle affiche les creations, echanges, taches et liens organisationnels dans les fiches metier existantes, sans creer de page globale tenant en V1.

## Modele de donnees

La migration `supabase/migrations/0006_timeline_events.sql` cree `timeline_events`.

Colonnes principales:
- `tenant_id`: tenant obligatoire, controle par RLS.
- `event_type`: type metier limite aux valeurs V1.
- `title`, `description`, `occurred_at`, `created_at`, `created_by`.
- liens nullable vers `person_id`, `organization_id`, `relationship_id`, `interaction_id`, `task_id`.
- `source_type` et `source_id`: origine technique de l'evenement.
- `idempotency_key`: cle unique par tenant pour eviter les doublons.
- `metadata`: informations d'affichage ou d'audit uniquement.
- `visibility`: `tenant` en V1.
- `deleted_at`: soft delete technique, sans interface de suppression manuelle en V1.

Les index couvrent le tenant, la date, le type, les contextes personne/organisation/relation et la source.

## Evenements V1

- `person_created`: Personne creee.
- `organization_created`: Organisation creee.
- `relationship_created`: Relation creee.
- `interaction_created`: Echange cree.
- `interaction_updated`: Echange modifie.
- `task_created`: Tache creee.
- `task_completed`: Tache terminee.
- `task_reopened`: Tache rouverte.
- `task_updated`: Tache modifiee.
- `task_deleted`: Tache supprimee.
- `organization_linked`: Organisation liee.
- `organization_unlinked`: Organisation dissociee.

## API

`GET /api/timeline` retourne les evenements du tenant courant, tries du plus recent au plus ancien.

Filtres:
- `personId`
- `organizationId`
- `relationshipId`
- `eventType`
- `category`: `all`, `interactions`, `tasks`, `relationships`, `organizations`
- `dateFrom`
- `dateTo`
- `page`
- `pageSize`

La route utilise toujours le tenant de session. Aucun `tenant_id` fourni par le navigateur n'est accepte.

## Architecture

- Repository: `apps/web/src/repositories/timeline-events.ts`
- Service d'ecriture non bloquant: `apps/web/src/services/timeline-service.ts`
- API: `apps/web/src/app/api/timeline/route.ts`
- Composants: `apps/web/src/components/timeline/*`
- Helpers: `apps/web/src/features/timeline/*`

Le service journalise les erreurs d'ecriture d'evenement mais ne fait jamais echouer l'action principale.

## Backfill

Le backfill n'est jamais lance automatiquement.

Commande migration:

```bash
supabase db push
```

Commande backfill:

```bash
npx tsx scripts/backfill-timeline.ts
```

Variables locales requises:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_TIMELINE_BACKFILL_KEY`

Ces valeurs restent locales et ne doivent jamais etre commitees.

## Securite

La RLS limite lecture et ecriture au tenant courant. Les politiques suivent les modules existants: lecture pour les membres actifs, insertion pour owner/admin/recruiter/manager, soft delete technique pour owner/admin.

## Evolutions V2

L'architecture prepare:
- notes manuelles;
- pieces jointes;
- emails;
- resumes IA;
- commentaires;
- reactions;
- notifications;
- page globale tenant.

Ces elements ne sont pas developpes en V1.
