# NEOS IMMO — Calendly gratuit et arrêt SMS

État : diagnostic en lecture seule déployé sur la branche QA ; aucune planification active.

Recette API réelle du 30 septembre 2026 : PASSED, 0 réservation et 0 modification.
Compte Calendly, compte Brevo, liste 8 et URL de rendez-vous vérifiés.
Le point POST `/api/internal/calendly/check` est limité à la branche et au projet QA,
avec le vérificateur du secret ordonnanceur existant. Simulation imposée dans le code ;
aucune valeur de requête ou variable ne peut activer les écritures.
7 tests de frontière HTTP, 6 tests worker, typecheck et lint ciblé.
Une recette avec réservation réelle reste nécessaire avant toute planification.

Le worker `scripts/calendly-sms-stop.mjs` fonctionne avec l'API de lecture
Calendly, disponible avec l'offre gratuite. Il n'envoie aucun message.
Il vérifie le compte Calendly NEOS, le compte Brevo épinglé et l'identité
de la liste d'arrêt 8 avant de traiter les réservations du lien exact
`https://calendly.com/renato-ponzio/30min`.

Il rapproche les adresses email exactes avec les contacts Brevo existants,
puis ajoute seulement les contacts reconnus à la liste d'arrêt. Il ne crée
aucun contact, ne modifie aucun consentement, et n'enlève aucune inscription.
Les réservations annulées ne réactivent jamais les relances.

## Installation restante

1. Installer le jeton dans un coffre de secrets côté serveur sous
   `CALENDLY_PERSONAL_ACCESS_TOKEN`, jamais dans un fichier versionné,
   une variable `NEXT_PUBLIC_`, les logs ou la Library.
   Portées : `users:read`, `event_types:read`, `scheduled_events:read`.
2. Fournir la clé Brevo du compte NEOS via `BREVO_API_KEY`.
3. Exécuter `node scripts/calendly-sms-stop.mjs` en simulation (défaut).
   Examiner les compteurs anonymes et résoudre les contacts non reconnus.
4. Faire une recette contrôlée avec une réservation et un contact de test.
   `AVENOR_CALENDLY_STOP_APPLY=true` autorise uniquement les ajouts à la liste 8.
5. Déployer un ordonnanceur serveur durable toutes les 15 minutes, avec
   exclusion des exécutions concurrentes et alerte sur échec. Cette étape
   n'est pas réalisée par ce worker et nécessite une installation distincte.
6. Tester dans Brevo la sortie sur ajout à la liste 8 avant toute activation.

## Limites à traiter avant lancement

- Délai nominal de détection jusqu'à 15 minutes, plus la durée du traitement.
  Une panne peut l'allonger. L'arrêt instantané n'est pas garanti.
- Seule l'adresse email exacte est rapprochée. Les contacts SMS sans email
  ou les réservations faites avec une autre adresse ne sont pas reconnus.
  Un rapprochement téléphonique vérifié reste à développer si nécessaire.
- Le worker reparcourt l'historique : limite de 50 pages par collection et
  400 requêtes par exécution. Le dépassement échoue explicitement ; il ne
  doit pas être présenté comme une synchronisation complète.
- Les réponses SMS ordinaires ne sont pas couvertes par ce worker.
- Brevo : garder la séquence 2 inactive, vérifier aussi l'exclusion des
  contacts déjà dans la liste 8 avant leur entrée dans le scénario.
- En cas d'échec pendant les ajouts, les ajouts déjà effectués sont conservés ;
  la prochaine exécution peut reprendre grâce au contrôle de présence dans la liste.

Validation locale : `node --test scripts/calendly-sms-stop.test.mjs`.

Références :
- https://calendly.com/help/calendly-api-overview
- https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-scheduled-events
- https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-event-invitees
- https://developers.brevo.com/reference/update-contact
