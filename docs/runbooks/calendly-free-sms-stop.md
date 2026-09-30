# NEOS IMMO — Calendly gratuit et arrêt SMS

État au 30 septembre 2026 : traitement avec verrou et journal déployé sur QA,
contrôle Calendly actif toutes les 15 minutes. La séquence Brevo 2 reste inactive.
Ce contrôle écrit dans la liste d'arrêt du compte Brevo NEOS ; il n'envoie aucun SMS.

Recette API réelle du 30 septembre 2026 : PASSED, 1 réservation, 1 contact reconnu,
1 ajout prévu, 0 modification en simulation. Appel réel depuis pg_net : HTTP 200.
Recette en écriture : HTTP 200, 1 ajout à la liste 8. Second passage : HTTP 200,
0 ajout, 1 contact déjà arrêté. Journal serveur : deux exécutions réussies.
Job dédié `neos-calendly-sms-stop-15m` créé (id 3, `*/15 * * * *`).
L'ancien job de relances email reste inactif. Aucun workflow Brevo n'a été activé.
Compte Calendly, compte Brevo, liste 8 et URL de rendez-vous vérifiés.
Le point POST `/api/internal/calendly/check` est limité à la branche et au projet QA,
avec le vérificateur du secret ordonnanceur existant. Simulation imposée dans le code ;
aucune valeur de requête ou variable ne peut activer les écritures.
17 tests de frontière HTTP, 6 tests worker, typecheck et lint ciblé réussis.
Verrou SQL testé dans une transaction annulée : premier appel accepté,
deuxième bloqué, libération valide, ancien verrou rejeté. Accès anon/authenticated interdit.
La réservation test du 1 octobre 2026, 10h00–10h30 Europe/Paris, est aussi visible
dans le Google Agenda principal. Ne pas recréer ce rendez-vous.
Brevo : branche 13 ajoutée avant SMS 1. Hors liste 8 : poursuite ; membre : sortie.

Le worker `scripts/calendly-sms-stop.mjs` fonctionne avec l'API de lecture
Calendly, disponible avec l'offre gratuite. Il n'envoie aucun message.
Il vérifie le compte Calendly NEOS, le compte Brevo épinglé et l'identité
de la liste d'arrêt 8 avant de traiter les réservations du lien exact
`https://calendly.com/renato-ponzio/30min`.

Il rapproche les adresses email exactes avec les contacts Brevo existants,
puis ajoute seulement les contacts reconnus à la liste d'arrêt. Il ne crée
aucun contact, ne modifie aucun consentement, et n'enlève aucune inscription.
Les réservations annulées ne réactivent jamais les relances.

## Installation et contrôle

1. Jeton installé dans un coffre de secrets côté serveur sous
   `CALENDLY_PERSONAL_ACCESS_TOKEN`, jamais dans un fichier versionné,
   une variable `NEXT_PUBLIC_`, les logs ou la Library.
   Portées : `users:read`, `event_types:read`, `scheduled_events:read`.
2. Clé Brevo du compte NEOS fournie via `BREVO_API_KEY`.
3. `node scripts/calendly-sms-stop.mjs` reste en simulation par défaut.
   Examiner les compteurs anonymes et résoudre les contacts non reconnus.
4. Recette contrôlée réalisée avec une réservation et le contact de test existant.
   `AVENOR_CALENDLY_STOP_APPLY=true` autorise uniquement les ajouts à la liste 8.
5. Le point `/api/internal/calendly/sync` acquiert un verrou de deux minutes
   via `claim_calendly_sms_stop_run`, puis ajoute à la liste 8 et journalise
   uniquement les compteurs. Limite de fonction 60 secondes, requêtes fournisseurs
   limitées à 45 secondes. Le commutateur SQL `enabled` est désactivé par défaut.
   Le fichier `supabase/cron/calendly-sms-stop-state.sql` a été appliqué uniquement
   sur QA. Le fichier `calendly-sms-stop-schedule.sql` a installé le contrôle 15 minutes.
   Le commutateur SQL est maintenant activé sur QA après la recette réussie.
   Inspecter `calendly_sms_stop_runs` ET les réponses HTTP pg_net : un succès cron
   prouve seulement la mise en file de la requête. Pas d'alerte externe installée.
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
  Les articles officiels Brevo 209447465 et 29257056512274 se contredisent sur
  la réception de réponses en France. Le critère « Message reçu » de Conversations
  ne constitue donc pas une preuve d'arrêt des réponses aux campagnes SMS.
- Brevo : garder la séquence 2 inactive. L'exclusion avant SMS 1 est enregistrée ;
  la sortie d'un contact déjà en attente doit encore être testée sans campagne.
- En cas d'échec pendant les ajouts, les ajouts déjà effectués sont conservés ;
  la prochaine exécution peut reprendre grâce au contrôle de présence dans la liste.

Validation locale : `node --test scripts/calendly-sms-stop.test.mjs`.

Références :
- https://calendly.com/help/calendly-api-overview
- https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-scheduled-events
- https://developer.calendly.com/api-docs/calendly-api/scheduled-events/list-event-invitees
- https://developers.brevo.com/reference/update-contact
