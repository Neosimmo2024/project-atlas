# Préparation de la synchronisation contacts Brevo — 24 septembre 2026

## Livraison et limite

Le module `apps/web/src/services/brevo-contact-plan.ts` calcule un plan pur.
Il n'effectue aucun appel réseau, ne lit aucune clé et n'accède à aucune base.
Il n'est appelé par aucune route, aucun import CSV ni aucun cron.
La fonction historique `prepareBrevoContact` reste inchangée.
La synchronisation effective n'est donc pas encore active.

25 tests simulés couvrent la préparation ; ils ont réussi localement sous
Vitest 3.2.4. Le résultat de la CI du nouveau commit doit être vérifié séparément.

## Décisions du plan

- Tenant du contact différent du tenant configuré côté serveur : refus.
- Identifiant invalide ou adresse inutilisable : refus.
- Nouveau contact sans autorisation ou avec opposition : aucun ajout.
- Nouveau contact autorisé : création proposée avec identifiant
  `atlas:<tenant UUID>:<person UUID>`, sans mise à jour implicite ni fusion.
- Contact Brevo existant : son identifiant externe doit correspondre exactement.
  Un contact existant sans cet identifiant nécessite un examen manuel, pas une adoption.
- Contact déjà lié et adresse identique : aucun changement. Les blocages existants
  chez Brevo sont conservés, même si la fiche locale autorise le contact.
- Opposition ou autorisation retirée : proposition de blocage email et SMS du
  contact identifié, sans changer son adresse.
- Changement d'adresse : examen manuel. Aucun remplacement automatique.

Aucune liste Brevo, aucun attribut personnalisé, aucun numéro de téléphone
et aucun déclencheur d'envoi n'est ajouté par cette préparation.

## Raccordement restant

1. Définir côté serveur une correspondance de confiance entre le tenant pilote
   et le compte Brevo. Une liste Brevo ne constitue pas une frontière de sécurité.
   Ne pas activer le même compte pour plusieurs tenants indépendants sans stratégie adaptée.
2. Lire la personne via un contexte autorisé et vérifier ses permissions actuelles.
   Ne jamais accepter le tenant de destination fourni librement par le navigateur.
3. Lire un état Brevo récent par identifiant externe ET rechercher les collisions
   d'adresse avant de préparer une création. Une réponse incertaine ou une erreur
   ne doit pas être interprétée comme une absence de contact.
4. Réévaluer le plan avant exécution. Une création doit garder
   `updateEnabled: false` et `forceMerge: false`. Un conflit de création doit
   revenir en examen, jamais en fusion ou en mise à jour forcée.
5. Ajouter un exécuteur serveur explicitement désactivé par défaut, une gestion
   des erreurs sans détails sensibles et une journalisation tenant/personne.
6. Après rétablissement de l'accès API et autorisation d'un essai réel, vérifier
   un contact fictif, sa répétition et son opposition. Vérifier auparavant les
   automatisations Brevo déclenchées par une création de contact.
7. Raccorder seulement ensuite la synchronisation au parcours métier choisi.

L'opposition dans ce plan concerne les indicateurs de contact Brevo ; elle ne
remplace pas les contrôles AVENOR avant envoi transactionnel et n'annule pas un
email déjà transmis. Aucun effet réel n'a été testé.

## Références officielles consultées

- https://developers.brevo.com/reference/create-contact
- https://developers.brevo.com/reference/update-contact

La documentation de mise à jour précise qu'un changement d'adresse d'un contact
bloqué peut le réinscrire. Le plan refuse donc cette opération automatique.

## Exécuteur serveur ajouté, activation toujours absente

Le module `brevo-contact-sync.ts` fournit maintenant l'exécution isolée du plan.
Il reste sans appelant métier : aucune route, aucun cron, aucune variable Vercel
ni import CSV n'a été raccordé. `enabled` doit être explicitement vrai ; sinon,
il retourne immédiatement sans lire de personne ni appeler Brevo.

Le futur appelant serveur devra fournir une correspondance compte/tenant de
confiance, une clé via un canal serveur, et une lecture de personne autorisée.
Ces éléments ne doivent jamais provenir directement d'un corps de requête client.
Aucun stockage de clé ni interface d'activation n'est ajouté ici.

L'exécuteur :
- cherche d'abord par identifiant externe tenant/personne ; seules les absences
  HTTP 404 avec code `document_not_found` sont considérées comme telles ;
- refuse les états incomplets, erreurs de lecture et identités contradictoires ;
- vérifie les collisions d'adresse avant création, sans adopter ni fusionner ;
- relit la source après la lecture Brevo et après la recherche de collision ;
- conserve les oppositions existantes et n'envoie que les champs du plan ;
- utilise une origine fixe, refuse les redirections et limite chaque requête à 10 s ;
- retourne des codes fixes sans erreur brute, clé ni données de contact ;
- ne réessaie aucune écriture automatiquement. Une réponse ambiguë retourne
  `write_outcome_unknown` et exige un rapprochement avant reprise.

27 tests de l'exécuteur et 25 du plan passent localement sous Vitest 3.2.4 avec
transport simulé et réseau réel interdit. La CI du commit doit confirmer ces résultats.

La documentation GET Brevo autorise la recherche par `identifierType=ext_id`,
mais son schéma de réponse ne garantit pas le retour du champ `ext_id`.
L'identité provient donc de cette recherche explicite ; toute valeur contradictoire
renvoyée est refusée. Source : https://developers.brevo.com/reference/get-contact-info

Restent avant activation : liaison au contexte autorisé de l'application,
journalisation persistante, association du compte pilote, inventaire des automatisations
Brevo et essai réel autorisé. Les relectures réduisent la fenêtre de changement de
permission mais ne garantissent pas l'atomicité entre AVENOR et Brevo. Le blocage
email/SMS du contact ne remplace pas le contrôle des envois transactionnels.

## Lecture autorisée préparée — 24 septembre 2026

`repositories/brevo-contact-source.ts` fournit désormais une source compatible
avec l'exécuteur. Elle déduit le tenant et l'utilisateur de la session serveur,
limite cette préparation aux rôles owner/admin, puis revérifie leur rattachement
à chaque lecture. Un changement de session, de tenant ou une révocation bloque
la lecture suivante. Le client Supabase authentifié conserve la RLS ; aucun client
administrateur ni service-role n'est utilisé. Seuls l'identité, l'adresse et les
deux indicateurs de permission sont sélectionnés, avec filtres tenant/personne.
Les erreurs sont remplacées par un code fixe sans détails sensibles.

24 tests simulés supplémentaires couvrent les permissions, la révocation,
les données incohérentes, les erreurs, la relecture des oppositions et l'arrêt de
l'exécuteur si les droits sont retirés pendant la lecture Brevo. Les 76 tests
contact passent dans le harnais local Vitest 3.2.4 ; la CI du commit reste à vérifier.
Ces simulations ne constituent pas une nouvelle preuve des politiques RLS en base.

L'adaptateur n'est appelé par aucune route métier. L'activation demeure absente.
Le journal actuel `audit_log` trace insert/update/delete de la base ; la timeline
ne définit pas d'événement de synchronisation contact. Aucun faux événement
« email envoyé » n'est utilisé pour remplacer un audit Brevo.
Restent une journalisation persistante dédiée (y compris issue d'écriture inconnue),
le raccordement applicatif, l'association fiable compte/tenant et la recette réelle
autorisée après résolution du blocage API. Les contrôles successifs ne garantissent
pas une transaction atomique entre la base et Brevo.

## CI #343 et correction du scénario Relation

Le commit `612f7acc5ff2c4921b70a3007b1ab9af5938a435` a validé
596 tests unitaires (dont les 24 nouveaux), 78 tests d'intégration, la restauration
locale et les trois Vercel. Sept E2E sur huit ont réussi.
https://github.com/Neosimmo2024/project-atlas/actions/runs/36028852639

La trace du scénario Relation montre que l'assertion d'URL acceptait encore
`/relationships/new`. La recherche a commencé 22 ms après le POST de création,
alors que celui-ci a répondu 201 après 2068 ms. Le test recherchait donc trop tôt.
Correction ciblée : attendre le POST de la personne et des notes attendues,
vérifier le 201 et l'identité retournée, puis attendre le chemin de cette relation
avec un délai de 15 secondes. Les assertions de recherche et la suite du parcours
sont conservées. Aucun comportement applicatif n'est modifié.

## Journal persistant préparé — 24 septembre 2026

La CI #344 du parent `a9912432` a réussi : 596 unitaires, 78 intégration,
8 E2E et trois Vercel. La présente évolution doit obtenir sa propre validation.

La migration `20260924195950_brevo_contact_sync_journal.sql` ajoute
`brevo_contact_sync_attempts`. Elle est préparée pour le dépôt et la CI locale ;
elle n'est appliquée à aucune base distante. Le journal conserve les identifiants
organisation/utilisateur/personne, les dates, un statut, un code de résultat fermé
et, en cas de succès, l'identifiant Brevo. Aucune adresse, clé ou erreur brute.

- Lecture réservée aux owner/admin actifs de l'organisation.
- Création uniquement par l'acteur authentifié pour une personne de son organisation.
- Clôture uniquement par cet acteur encore autorisé, depuis l'état pending.
- Identité et date de création non modifiables ; résultats terminés non modifiables.
- Aucun droit de suppression pour les clients authentifiés ou anonymes.
- Index unique tenant/personne pour les états pending et write_outcome_unknown :
  une tentative concurrente, interrompue ou incertaine empêche une nouvelle tentative.
- La suppression d'une personne/utilisateur ne supprime pas son identifiant de journal ;
  la suppression de l'organisation supprime son journal. Une politique de conservation
  opérationnelle reste à définir avant activation.

`syncBrevoContactWithJournal` attend la confirmation de l'écriture pending avant
l'exécution. Si la clôture échoue, il retourne journal_completion_failed sans relancer
et sans annoncer un succès confirmé. La ligne pending reste bloquante. Les erreurs
inattendues sont traitées comme un résultat incertain. Les appels restent désactivés
par défaut et aucune route/variable/cron n'est activé. Le futur appelant serveur
utilisera l'adaptateur de source autorisée et ce journal, jamais le moteur brut seul.

11 tests du contrôleur et 21 tests du dépôt de journal s'ajoutent aux 76 tests contacts
existants : 108 réussites locales sous Vitest 3.2.4. Le script transactionnel
`scripts/test-brevo-contact-journal.sql` teste permissions, isolation, identité,
transitions, révocation, blocages et absence d'accès anonyme. Il réussit en PostgreSQL
embarqué local avec un socle Auth minimal ; la CI exécute le même script dans le vrai
Supabase local après contrôle explicite de l'URL locale. Tous ses fixtures sont annulés.

Le journal est un suivi applicatif, pas une preuve indépendante de livraison Brevo.
Il ne garantit pas l'atomicité avec le fournisseur. Une tentative incertaine n'est
jamais déverrouillée automatiquement ; le parcours de rapprochement contrôlé reste
à développer avant activation. Aucun accès Brevo réel ni aucune écriture distante.


### CI #345 reset simulation follow-up

The migration applied successfully, but the local reset simulation stopped because its explicit migration manifest still listed only 0001 through 0021. The manifest now includes exactly 20260924195950_brevo_contact_sync_journal.sql; no wildcard acceptance was introduced. The journal is included in snapshot counts (required empty), post-reset table presence and RLS checks. A regression test refuses reset if any journal attempt exists. Local guard checks confirmed the exact manifest, full count-query coverage, rejection of nonempty/missing journal observations and rejection of remote URLs. Full CI remains to be verified on the follow-up commit.
