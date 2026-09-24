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
