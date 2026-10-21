# Recette globale du pilote — 23 septembre 2026

Base auditée : 5a2bc5f3ba2b21998db8c3bedb13415a844c01c3, PR #68.
CI de référence : https://github.com/Neosimmo2024/project-atlas/actions/runs/35862084977

## Preuves disponibles

- 492 tests unitaires réussis dans 92 fichiers.
- 78 tests d'intégration réussis dans 13 fichiers, sur Supabase local fictif.
- 6 scénarios navigateur réussis : foundation-ui, projects, relationships, recruitment-pipeline, recruitment-pipeline-ui, csv-import-history.
- Lint, typecheck, build et restauration logique locale réussis.
- Trois Vercel réussis sur ce même head.
- Correction tenant-context : cinq tests exécutés. Une erreur de requête n'est plus assimilée à une absence de rattachement. Cause de l'incident intermittent initial non établie.

## Lacune traitée par ce lot

Les tests dédiés tasks.e2e.spec.ts et interactions.e2e.spec.ts existaient mais n'étaient pas inclus dans la commande E2E CI.
Ils sont ajoutés à la commande après alignement des sélecteurs sur les panneaux repliables et les cartes de l'interface.
Les URL de création doivent être des URL de détail, et non /new.
Les assertions de suppression attendent la liste exacte.
Le budget des scénarios complets est de 180 secondes, sans suppression d'assertions.
Syntaxe vérifiée localement ; exécution réelle à confirmer par la nouvelle CI.

## Points restant à vérifier

| Domaine | État / prochaine preuve |
| --- | --- |
| Tâches et échanges dédiés | Attendre exécution et réussite des deux nouveaux scénarios CI |
| Session prolongée, récupération après incident | À vérifier dans la QA déployée ; une suite verte ne prouve pas la disparition de l'incident initial |
| Import/dédoublonnage | Tests locaux présents ; compléter la recette utilisateur et vérifier les cas limites du pilote |
| Brevo | Code d'envoi initial, relances et modèles présent dans services/brevo.ts ; configuration opérationnelle et parcours complet non attestés ici |
| Synchronisation contacts Brevo | prepareBrevoContact est encore une fonction de préparation sans envoi |
| SMS / n8n | Périmètre, implémentation et activation à inventorier ; non validés par les preuves ci-dessus |
| Sauvegardes hébergées | Test physique hébergé non effectué ; le test logique local ne le remplace pas |
| Production | Pas de décision de mise en service ; PR Draft, aucune fusion |

Le README contient encore un descriptif initial des intégrations : il ne suffit pas à décrire l'état actuel.
Aucun email/SMS envoyé, aucune base distante modifiée pour cette recette.
