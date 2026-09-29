# Envoi SMS personnel unique — préparation QA

Le parcours est raccordé à POST /v3/transactionalSMS/send. Il reste désactivé par défaut : aucune variable d’activation ni aucun destinataire réel n’est configuré par ce lot, et aucun SMS n’est envoyé.

## Périmètre

- Projet Vercel Preview QA et base mahgxumwucxehsooijag uniquement, tenant QA et propriétaire Renato connus côté serveur.
- Numéro +336/+337 fixé dans ATLAS_SMS_PILOT_RECIPIENT ; ATLAS_SMS_PILOT_ENABLED doit valoir 1. Ces variables sont serveur uniquement et doivent être limitées à la branche QA autorisée. Le navigateur ne choisit pas le destinataire envoyé : sa confirmation doit correspondre au numéro configuré.
- Message technique fixe de 104 caractères, expéditeur NEOSIMMO, type transactionnel, sans lien, promotion ou relance. Aucun contact Brevo n’est créé ou modifié ; la fixture 334 reste sans téléphone.
- L’activation doit être précédée de la validation du compte SMS, de l’expéditeur, des crédits disponibles et de l’autorisation du numéro et du message. Aucune activation ni achat de crédits dans ce lot.

## Contrôles

La session, le rôle, le tenant et le périmètre sont vérifiés avant l’opération, avant la réservation du journal et immédiatement avant le POST. Le compte Brevo est relu avec la même clé avant réservation. Une révocation avant le POST annule la tentative. Une révocation après transmission ne peut rappeler un SMS : le résultat doit néanmoins être conservé.

Une clé primaire sur tenant_id interdit toute seconde tentative, quel que soit son statut (y compris après changement de numéro, rechargement ou redéploiement). Le journal est réservé durablement avant l’appel fournisseur. Si la réservation échoue ou si le processus s’arrête, aucun réessai automatique n’est permis. Les résultats finaux ne peuvent être modifiés par l’application.

HTTP 201 avec un identifiant vérifiable signifie « accepté par Brevo », jamais « livré ». Une réponse malformée, un timeout, un HTTP 5xx ou un échec de clôture du journal produit un résultat incertain, sans nouveau POST. Un refus explicite ne permet pas non plus de réessayer sans un nouveau travail de revue et une nouvelle autorisation.

Le journal conserve uniquement les quatre derniers chiffres du destinataire, l’empreinte du message, l’acteur, les dates et l’identifiant fournisseur. Pas de clé, numéro complet ou corps de réponse. RLS active ; le propriétaire auteur peut lire sa ligne, les écritures sont réservées au serveur et la suppression est révoquée, y compris pour service_role.

## Vérification

Tests unitaires : concurrence/double clic, configuration désactivée, identité et autorisation, numéro arbitraire refusé, compte différent, timeout, résultat accepté non assimilé à une livraison, clôture indisponible et refus de réessai. Le script SQL scripts/test-sms-personal-pilot.sql vérifie les privilèges, l’isolation, les transitions immuables et l’unicité avant/après résultat. Il est exécuté uniquement sur la base locale éphémère de CI.

Migration additive : 20260929082400_sms_personal_pilot_journal.sql. Aucune modification de main ni fusion. L’installation QA et la validation finale sont consignées dans la PR après réussite des contrôles.

Documentation fournisseur consultée le 29 septembre 2026 : https://developers.brevo.com/docs/transactional-sms-endpoints.
