# Action Plan Engine Specification

## Objectif

Le moteur du Plan d'action calcule les actions les plus importantes qu'un utilisateur doit traiter maintenant pour une organisation donnee. Le resultat est une vue calculee : il ne cree pas une seconde liste de taches.

Le moteur est deterministe, testable sans React et n'utilise pas d'IA en V1.

## Architecture

- Migration : `supabase/migrations/0007_action_plan_engine.sql`.
- Moteur pur : `apps/web/src/features/action-plan/engine.ts`.
- Configuration des scores : `apps/web/src/features/action-plan/config.ts`.
- Repository serveur : `apps/web/src/repositories/action-plan.ts`.
- API minimale : `GET /api/action-plan`.

Le repository valide toujours l'organisation demandee dans le tenant courant avant de charger les donnees. Les taches sont filtrees en base sur l'organisation demandee et sur les relations actives de cette organisation ; le resultat ne depend pas d'une limite globale de tenant appliquee avant le filtrage metier. Les interactions liees aux relations actives sont aussi chargees sans limite arbitraire afin de determiner correctement le dernier echange.

## Modele de donnees

### Champs ajoutes a `tasks`

- `snoozed_until`
- `snooze_count`
- `last_snoozed_at`

Ces champs ne remplacent jamais `due_at`. `due_at` reste l'echeance metier.

### `action_plan_decisions`

La table conserve les decisions utilisateur sur les recommandations automatiques.

Colonnes :

- `id`
- `tenant_id`
- `organization_id`
- `user_id`
- `recommendation_key`
- `decision_type`
- `snoozed_until`
- `created_at`
- `updated_at`

Valeurs `decision_type` :

- `ignored`
- `snoozed`
- `converted_to_task`
- `completed`

Une contrainte unique evite les doublons pour le meme tenant, la meme organisation, le meme utilisateur et la meme recommandation.

Une contrainte tenant/organisation garantit que `organization_id` reference une organisation appartenant au meme `tenant_id` que la decision. Les policies RLS repetent cette verification cote base pour empecher toute association cross-tenant.

## Sources V1

Le moteur utilise uniquement :

- taches ouvertes non supprimees ;
- relations actives ;
- derniers echanges lies aux relations ;
- priorite manuelle ;
- echeance ;
- reports ;
- decisions utilisateur sur les recommandations.

Sont explicitement exclus :

- OpenAI ;
- Gmail ;
- analyse d'e-mails ;
- assistant conversationnel ;
- notifications.

## Regles de score

Les poids sont centralises dans `ACTION_PLAN_SCORE_WEIGHTS`.

- retard superieur a 24 heures : `+50`
- retard inferieur ou egal a 24 heures : `+40`
- echeance aujourd'hui : `+35`
- priorite elevee : `+25`
- priorite moyenne : `+10`
- chaque report : `+10`
- trois reports ou davantage : `+20` supplementaires
- relation inactive depuis au moins 14 jours : `+20`
- relation inactive depuis au moins 30 jours : `+35`
- tache importante sans echeance : `+15`

Une relation inactive depuis 30 jours applique uniquement le niveau `30D`, sans cumul avec `14D`.

## Categories

Les categories sont :

- `critical`
- `priority`
- `opportunity`
- `to_schedule`

Les regles explicites priment sur le score. Le tri final applique :

1. ordre de categorie ;
2. score decroissant ;
3. echeance la plus proche ;
4. date de creation la plus ancienne ;
5. identifiant stable.

## Recommandations de relations inactives

Une recommandation `relationship_recommendation` est creee quand :

- la relation est active ;
- elle appartient a l'organisation demandee ;
- le dernier echange date d'au moins 14 jours ;
- aucune tache ouverte equivalente n'existe ;
- aucune decision utilisateur ne masque la recommandation.

Sans echange, la date de creation de la relation sert de point de depart.

L'identifiant stable est :

`relationship_inactive:<relationship_id>`

## Deduplication

Une tache ouverte prend le dessus sur une recommandation automatique liee a la meme relation lorsqu'elle contient un signal deterministe de suivi :

- relance ;
- rappel ;
- appel ;
- reprise de contact ;
- recontacter ;
- suivi.

La detection n'utilise pas d'IA.

## API

`GET /api/action-plan`

Parametres :

- `organizationId` obligatoire ;
- `now` optionnel, ISO date, reserve aux tests et controles deterministes.

L'identifiant utilisateur n'est pas accepte comme parametre public. Le repository utilise exclusivement l'utilisateur authentifie present dans le contexte serveur.

Reponse :

```json
{
  "data": []
}
```

Chaque item contient :

- source ;
- titre ;
- categorie ;
- score ;
- raisons structurees ;
- contexte personne / organisation / relation ;
- action principale ;
- actions disponibles.

## RLS et securite

- `action_plan_decisions` active RLS.
- Les decisions sont visibles uniquement par leur utilisateur et dans leur tenant.
- Insert/update sont limites aux roles `owner`, `admin`, `recruiter`, `manager`.
- Aucune cle `service_role` n'est utilisee cote navigateur.
- Le `organizationId` fourni a l'API est toujours valide cote serveur dans le tenant courant.
- Une decision ne peut pas referencer une organisation d'un autre tenant, meme si le navigateur envoie un couple `tenant_id` / `organization_id` incoherent.

## Limites V1

- Pas d'interface React dediee.
- Pas de mutations UI pour terminer ou reporter.
- Pas de creation automatique de taches depuis recommandations.
- Pas d'evenement de Chronologie artificiel pour les recommandations.
- Pas de personnalisation utilisateur des seuils.
- Pas d'IA.

## Evolutions V2

- Page "Mon Plan d'action".
- Mutations utilisateur : terminer, reporter, convertir en tache.
- Explications visuelles des raisons.
- Preferences de score par tenant ou utilisateur.
- Automatisations et notifications.
