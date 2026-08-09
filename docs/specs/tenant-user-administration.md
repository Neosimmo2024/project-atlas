# Administration tenant et utilisateurs

## Objectif

Le lot 4 ajoute une administration minimale de l'equipe du tenant actif.

La page `/admin/team` permet aux utilisateurs autorises de consulter les membres deja rattaches au tenant et de gerer leur role ou leur statut. Elle ne cree aucun utilisateur Auth, n'envoie aucune invitation et ne rattache aucun nouveau membre.

## Acces

L'interface et les operations serveur sont reservees aux roles Atlas :

- `owner` ;
- `admin`.

Les roles `recruiter`, `manager` et `reader` ne voient pas l'entree de navigation et sont refuses cote serveur.

Le tenant est toujours resolu depuis la session authentifiee via `getTenantContext()`. Le navigateur ne peut pas choisir librement un `tenant_id`.

## Donnees affichees

La page affiche :

- le tenant actif ;
- les membres du tenant actif ;
- le nom disponible dans `profiles.full_name` ;
- l'e-mail disponible dans `profiles.email` ;
- le role ;
- le statut.

Les statuts existants du modele sont `active`, `invited` et `suspended`.

Les lignes `invited` deja presentes peuvent etre affichees, mais elles ne sont pas gerees dans cette version. Atlas ne permet aucune transition vers `invited` depuis cette interface.

## Operations autorisees

La RPC transactionnelle `public.manage_tenant_member` permet uniquement :

- `change_role` ;
- `suspend` ;
- `reactivate`.

Elle determine l'acteur avec `auth.uid()`, retrouve son tenant actif, verrouille le tenant avec `FOR UPDATE`, verrouille la ligne cible, puis applique les regles hierarchiques.

### Owner

Un `owner` peut :

- consulter tous les membres de son tenant ;
- attribuer les roles `owner`, `admin`, `recruiter`, `manager` et `reader` ;
- suspendre ou reactiver un membre existant.

Un `owner` ne peut pas :

- suspendre son propre acces ;
- retrograder ou suspendre le dernier owner actif du tenant.

### Admin

Un `admin` peut :

- consulter les membres de son tenant ;
- gerer les membres `admin`, `recruiter`, `manager` et `reader` ;
- modifier leurs roles entre `admin`, `recruiter`, `manager` et `reader` ;
- suspendre ou reactiver ces membres.

Un `admin` ne peut pas :

- attribuer le role `owner` ;
- modifier, retrograder, suspendre ou reactiver un owner ;
- suspendre son propre acces.

## Securite RLS

La lecture de `tenant_users` reste limitee aux membres du tenant par RLS.

Les mutations directes `insert`, `update` et `delete` sur `tenant_users` sont retirees pour le role PostgREST `authenticated`. Les mutations utilisateur passent par la RPC controlee.

La RPC est `SECURITY DEFINER`, fixe `search_path = public, pg_temp`, qualifie les objets SQL et limite son `EXECUTE` a `authenticated` et `service_role`.

La protection du dernier owner actif est transactionnelle : la ligne du tenant est verrouillee avant le recompte des owners actifs, afin que deux mutations concurrentes ne puissent pas laisser le tenant sans owner.

## Hors perimetre

Le lot ne couvre pas :

- creation d'utilisateur Supabase Auth ;
- invitation par e-mail ;
- rattachement d'un nouvel utilisateur ;
- Supabase Auth Admin cote fonctionnalite produit ;
- suppression definitive d'utilisateur ;
- administration globale multi-tenant ;
- changement manuel de tenant ;
- facturation ;
- audit avance ;
- Brevo, SMS, n8n ou IA.

## Recette

La recette doit verifier :

- affichage desktop et mobile ;
- acces owner ;
- acces admin ;
- refus recruiter, manager et reader ;
- modification de role autorisee ;
- suspension et reactivation autorisees ;
- refus d'attribution owner par admin ;
- refus de modification d'un owner par admin ;
- refus de self-suspension ;
- protection du dernier owner actif ;
- absence de creation Auth, invitation ou suppression utilisateur.
