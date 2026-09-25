# Bilan V1 pilote AVENOR — 24 septembre 2026

## Référence et conclusion

PR #68, branche `agent/v1-pilot-renato-stabilization-lot-9i`.
Base vérifiée : `f29a05f7dd3e250d30fd6cf2f19ca74a0d2ed6bc`.
CI #338 : https://github.com/Neosimmo2024/project-atlas/actions/runs/35985349803

Le socle testé est vert. Le parcours opérationnel Brevo reste à raccorder et à
valider. Cela ne constitue pas une validation de toute l'application en production.
La PR reste Draft ; aucune fusion ni modification de main.

## Preuves consultées

Les journaux de la CI #338 attestent :
- 508 tests unitaires réussis, dont 9 tests de l'orchestrateur et 7 tests
  d'authentification du webhook ;
- 78 tests d'intégration réussis sur base locale fictive ;
- 8 scénarios E2E réussis (4,5 minutes) ;
- message exécuté `Local logical backup restored: table contents, row counts, RLS flags and policies match.`

Les trois statuts Vercel de cette base sont réussis. Le redéploiement QA après
ajustement des variables de branche est Ready :
https://vercel.com/neos-immo/project-atlas-qa-beta-1/HyotFErnNxuWQe9HRoCM7LyYjCWS

Ces preuves appartiennent à la base ci-dessus. Toute nouvelle modification doit
obtenir sa propre CI et ses trois statuts Vercel avant d'être déclarée validée.

## État par domaine

| Domaine | État prouvé | Reste à faire |
| --- | --- | --- |
| Personnes, organisations, relations, projets, pipeline | Parcours automatisés verts dans la CI de référence | Recette utilisateur sur le périmètre pilote |
| Tâches et interactions | Deux scénarios dédiés inclus ; huit scénarios E2E au total réussis | Valider l'ergonomie quotidienne avec Renato |
| Accès et rattachement | Erreur de requête distinguée de l'absence de tenant ; tests verts | Session prolongée et cause de l'incident initial non établies |
| Import et historique | Parcours et intégration locale testés | Cas limites métier, doublons et recette utilisateur |
| Arrêt des relances | 9 tests simulés verts | Livraison réelle webhook et exécution cron non prouvées |
| Authentification webhook | 7 tests verts, dont secret multioctet invalide | Vérifier le secret partagé et l'accessibilité du déploiement depuis Brevo |
| Traitement d'une réponse | Code d'arrêt, tâche et historique présent | Tests simulés complémentaires ajoutés dans ce lot ; preuve CI du nouveau commit requise |
| DNS Brevo | Domaine racine authentifié dans Brevo ; sous-domaine reply déjà authentifié | Ne pas confondre authentification DNS et livraison webhook |
| Configuration API Brevo | Deux clés Atlas existantes actives, valeurs masquées ; création de nouvelle clé refusée | Ticket support envoyé par Renato, retour attendu ; inventaire API des webhooks encore nécessaire |
| Synchronisation contacts | `prepareBrevoContact` retourne `prepared: true, sent: false` sans envoi | Synchronisation effective à développer avant de la promettre |
| SMS / n8n | Pas de preuve opérationnelle dans cette recette | Inventaire et décision de périmètre ; aucun envoi ni activation |
| Sauvegardes | Restauration logique locale de données fictives réussie | Aucune preuve de restauration physique hébergée |

## Recette utilisateur préparée (pas encore exécutée)

À réaliser dans un environnement de test expressément autorisé. Les restrictions
actuelles interdisent tout accès à une base distante et tout envoi réel ; ce document
ne les lève pas. Utiliser des données fictives, sans adresse ni numéro de candidat réel.

1. Ouvrir la session et vérifier l'organisation/tenant attendu. Après rechargement,
   retrouver le même contexte ; une erreur réseau ne doit pas être présentée comme
   une absence de rattachement.
2. Créer une personne fictive autonome, puis la retrouver par recherche. Vérifier
   ses informations après rechargement et l'absence de doublon involontaire.
3. Relier la personne à une organisation et au pipeline recrutement. Changer une
   phase, recharger, vérifier la phase et le retour vers la bonne personne.
4. Ajouter une qualification et vérifier les valeurs conservées.
5. Créer une tâche liée à cette personne, modifier sa raison et son échéance,
   vérifier les liens de retour puis la terminer.
6. Ajouter un échange et un projet liés ; vérifier leur présence et leurs liens
   depuis la personne et l'organisation.
7. Importer un petit CSV fictif contenant un doublon volontaire. Comparer le bilan
   d'import, les fiches créées et l'historique ; documenter tout résultat inattendu.
8. Consigner pour chaque étape : résultat attendu, résultat observé, capture sans
   données personnelles, anomalie éventuelle. Les étapes email restent séparées.

## Reprise Brevo après le retour du support

1. Obtenir un accès API utilisable par un canal sécurisé, sans exposer de clé dans
   une conversation, un dépôt ou des logs. Ne pas supprimer les clés existantes.
2. Lister les webhooks de type inbound avant toute création pour éviter un doublon.
3. Vérifier le domaine `reply.neos-immo.com`, l'événement `inboundEmailProcessed`
   et l'URL `/api/internal/recruitment-email/inbound` du déploiement QA approprié.
4. Vérifier l'en-tête `x-atlas-brevo-webhook-secret` et sa concordance avec la
   variable serveur. Vérifier aussi les protections d'accès Vercel : un statut Ready
   ne prouve pas l'accès depuis Brevo. Ne pas affaiblir les protections pour un test.
5. Après autorisation explicite d'un test opérationnel et de ses effets en base,
   vérifier une réponse, sa répétition, un expéditeur incorrect et l'absence de
   relance future, puis rapprocher tâche et historique. Aucun de ces essais réels
   n'a été effectué par ce lot.
6. Valider séparément le planificateur/cron et ses secrets avant toute activation.

Un arrêt enregistré au contrôle avant envoi bloque la relance. Il n'annule pas un
email déjà transmis au prestataire. Les simulations ne prouvent pas l'atomicité,
les courses concurrentes en base, ni la livraison opérationnelle Brevo/cron.

## Validation complémentaire — CI #339

Commit `f6682022267753216eede468d4bfad8c977f5f70` :
https://github.com/Neosimmo2024/project-atlas/actions/runs/36018004132

- 520 tests unitaires réussis, dont les 12 nouveaux tests de traitement des réponses.
- 78 tests d'intégration réussis ; lint, typecheck, build et restauration locale réussis.
- Trois statuts Vercel réussis ; 7 scénarios E2E sur 8 réussis.
- Échec de `tasks.e2e.spec.ts:30` : délai de navigation de 5 secondes dépassé.
  La trace prouve un POST /api/people réussi en 201 après 4730 ms, puis le serveur
  répond en 200 à la fiche créée (530 ms dans next.log).
- Correction ciblée du test : attendre la réponse POST correspondant au nom fictif,
  vérifier 201, nom et identifiant retournés, puis l'URL exacte de cette personne
  avec un délai de 15 secondes. Aucun changement du comportement applicatif.
  Cette correction doit obtenir sa propre validation CI ; aucun essai E2E local.
