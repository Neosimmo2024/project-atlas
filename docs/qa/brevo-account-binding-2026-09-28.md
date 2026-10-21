# Liaison serveur du compte Brevo — 28 septembre 2026

## Changement

`verifyBrevoAccountBinding` effectue uniquement GET /v3/account et compare exactement
`organization_id` à une identité attendue fournie par le serveur. Le tenant doit
correspondre à la liaison serveur. Aucun apprentissage automatique de l'identité,
aucun recours au nom commercial ou à l'email, aucun cache ou redirection.
Configuration manquante, erreur réseau, JSON invalide ou compte différent : blocage.
Le corps fournisseur (qui peut contenir une clé d'automatisation) n'est ni renvoyé,
ni stocké, ni journalisé. Seul un statut fixe sort du vérificateur.

`inspectConfiguredBrevoContactAttempt(attemptId)` prépare l'entrée serveur pour
les contrôles audités. La clé et les identifiants viennent exclusivement des
variables serveur, jamais de données de requête. Vérification owner/admin et
tenant avant le GET ; utilisateur, tenant et rôle revérifiés après. La même copie
de clé est utilisée pour le compte et le contrôle de contact. Les vérifications
RLS et l'audit existants restent ensuite appliqués.

Portée limitée au projet Vercel QA Preview et à l'URL Supabase QA exacte.
Configuration prévue, **non installée/non activée par ce lot** :

- `ATLAS_BREVO_CONTACT_CHECK_ENABLED=1` : autorise seulement les contrôles.
- `ATLAS_BREVO_CONTACT_TENANT_ID` : UUID du tenant confirmé.
- `ATLAS_BREVO_ORGANIZATION_ID` : identifiant Brevo confirmé indépendamment.
- `BREVO_API_KEY` : secret serveur existant, jamais exposé au client.

## Validation et limites

40 nouveaux tests : refus d'accès, portée, compte incorrect, redirections/statuts
HTTP, données invalides, confidentialité, changement de session et rotation de
configuration pendant l'attente. Les tests utilisent uniquement des réponses
fictives, sans appel réel à Brevo. Résultats complets de CI et déploiement dans
la PR #69 afin de distinguer préparation et vérification distante.

Aucune route, Server Action, UI ou tâche planifiée n'appelle cette entrée. Les
primitives existantes restent des fonctions internes réservées au code serveur ;
les futurs points d'entrée doivent passer par la composition configurée.
Aucune migration ni écriture de contact Brevo, aucun email/SMS, aucun n8n.
Un contrôle réussi ne prouve pas l'authentification des emails entrants et ne
résout ni ne déverrouille une tentative : `retryAllowed` reste faux.

La liaison réelle reste à configurer puis vérifier sur le compte NEOS IMMO :
l'identifiant attendu ne doit pas être déduit aveuglément de la clé à contrôler.
Ce lot ne constitue pas une activation de synchronisation et ne raccorde pas
l'exécuteur d'écriture. La résolution auditée des résultats incertains reste un
lot distinct. Aucun changement de main ni de production.

Référence officielle consultée :
https://developers.brevo.com/reference/get-account
(GET, en-tête api-key, organization_id décrit comme identifiant d'organisation).
