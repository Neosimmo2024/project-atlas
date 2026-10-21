# Clôture conservatrice des revues Brevo — 28 septembre 2026

## Comportement

Ce lot prépare la clôture **de la revue**, avec maintien du blocage des nouvelles
tentatives. Il ne remplace jamais un résultat historique incertain par « créé »
ou « bloqué ». Une observation actuelle ne permet pas d'attribuer une écriture à
une tentative passée. La table des tentatives, son trigger et son index unique
restent inchangés : aucune libération du verrou ni autorisation de réessai.

`closeConfiguredBrevoContactReview` exige une activation serveur distincte
(`ATLAS_BREVO_CONTACT_REVIEW_ENABLED=1`, absente par défaut), la confirmation
`keep_blocked`, un propriétaire/administrateur et une tentative RLS appartenant
au tenant. Seules les tentatives `write_outcome_unknown` sont recevables ; les
`pending` peuvent correspondre à un processus actif et restent exclues.

Un nouveau contrôle configuré est exécuté : il conserve les protections QA,
liaison tenant/organisation Brevo, lecture fournisseur seulement et audit du
lot précédent. Seules une association observée ou une suppression observée
permettent la revue. Absence, erreur, changement de source ou consentement à
traiter ne permettent pas de clôture. Les droits et la session sont revérifiés
avant la persistance.

La RPC `close_brevo_contact_review` est SECURITY INVOKER, exécutable uniquement
par service_role. Elle verrouille la tentative, revérifie le membre actif et son
rôle, puis exige un contrôle du même tenant, auteur, tentative et état, âgé de
moins de cinq minutes. Tout contrôle plus récent ou de même horodatage rend
l'ordre ambigu et entraîne un refus. Une répétition autorisée renvoie la revue
existante sans la modifier ; les revues sont uniques par tentative.

`brevo_contact_reviews` conserve uniquement références, décision énumérée et
date. Lecture owner/admin sous RLS ; aucune écriture client ; serveur sans droits
UPDATE/DELETE. Les suppressions en cascade et le propriétaire de base restent
hors garantie d'immutabilité absolue, comme pour l'audit existant.

La page de suivi lit les revues du tenant pour les seules opérations affichées.
Elle distingue « revue clôturée » et « résultat de l'écriture initiale incertain ».
Une erreur de lecture des revues n'est pas présentée comme absence de revue.
La date `finished_at` est libellée « Dernier résultat enregistré », pour éviter de
présenter un résultat incertain comme une clôture confirmée de l'opération.

## Validation

- 820 tests unitaires / 111 fichiers, TypeScript et lint réussis localement.
- 33 nouveaux tests de serveur et de lecture d'historique.
- Tests SQL embarqués : journal et audit existants, refus pending, état obsolète,
  preuve absente/périmée/dépassée, auteur/tenant/rôle incorrect, répétition,
  révocation, droits lecture/écriture et maintien du verrou après clôture.
- Manifeste de reconstruction, comptages et vérification RLS mis à jour ; nouveau
  test SQL intégré à la CI Supabase réelle. Résultat final consigné dans la PR.

## Limites et déploiement

Pas de route/Server Action/bouton de clôture appelant la nouvelle fonction, aucune
activation de configuration ni appel réel d'écriture à Brevo. L'identifiant
d'organisation réel reste à confirmer indépendamment avant les contrôles réels.
La clôture avec autorisation de réessai ou reprise de synchronisation est exclue :
elle nécessiterait notamment un mécanisme empêchant un ancien exécuteur en cours
d'écrire après la clôture. Aucun email/SMS, aucun n8n, aucun changement de main
ou de production. Installation du schéma limitée à QA ; aucun dossier réel clos.

Migration dépôt : `20260928080003_brevo_contact_review_closure.sql`.
Correspondance de version distante et résultats de recette dans la PR #69.
