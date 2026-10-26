# ADR-003 — Diagnostic SMTP IONOS pour Les Formateurs Immo

Statut : pilote, campagnes non activées. Issue #85.

## Décision

Conserver contact@lesformateursimmo.com. Ajouter un diagnostic SMTP indépendant
sans modifier les envois Brevo ou les modèles de recrutement NEOS. Le transport
est verrouillé sur smtp.ionos.fr:465 avec validation TLS et TLS 1.2 minimum.
Aucun champ client ne permet de choisir un hôte, un expéditeur ou un destinataire.

La configuration serveur est limitée à un tenant UUID explicite et à ses rôles
owner/admin. Ne pas utiliser le nom du tenant comme contrôle de sécurité.
Aucun mot de passe n'est enregistré dans Git, la base, le navigateur ou les logs.
L'état public n'indique que la présence d'un secret ; il ne prouve pas sa validité.
Le bouton vérifie DNS/TCP/TLS/authentification sans appeler sendMail.

## Mise en service du diagnostic

1. Confirmer l'UUID du tenant Les Formateurs Immo (pas l'UUID d'un projet).
2. Définir LFI_IONOS_TENANT_ID sur l'environnement de déploiement visé.
3. Renato renseigne LFI_IONOS_SMTP_PASSWORD dans le gestionnaire sécurisé de
   variables d'environnement. Utiliser le mot de passe exact de la boîte contact,
   pas celui du compte IONOS. Ne jamais le copier dans une issue ou un chat.
4. Redéployer et ouvrir /admin/email-connection avec un administrateur du tenant.
5. Cliquer Vérifier la connexion. Le succès ne prouve pas la délivrabilité ni
   l'acceptation d'un message par le serveur.

Rollback : retirer les deux variables. Les routes et campagnes Brevo restent
inchangées. Ce pilote ne propose volontairement aucun bouton d'activation SMTP.

## Conditions avant la migration des campagnes (non implémentées ici)

- Modèles/signatures LFI indépendants de Brevo et de NEOS.
- Outbox durable par tenant avec réservation atomique, quota horaire partagé
  avec les usages habituels de contact, cadence initiale prudente.
- Ne pas réessayer automatiquement un envoi SMTP de résultat incertain : un
  Message-ID stable seul n'assure pas l'idempotence SMTP.
- Désinscriptions signées et exclusions appliquées avant chaque envoi.
- Réponses IMAP, refus et rebonds stoppant les séquences correspondantes.
- Message pilote à Renato puis petit lot, inspection des signatures, liens,
  SPF/DKIM/DMARC et réception effective avant élargissement.
- Ne résilier Brevo qu'après validation de ces parcours.

Références : https://nodemailer.com/smtp ; documentation SMTP IONOS.

## Test de réception (26 octobre 2026)

Le diagnostic SMTP est confirmé par la capture utilisateur. Un bouton distinct
prépare un unique message technique vers renatoponzio@gmail.com. Expéditeur,
destinataire, objet et contenu sont fixes côté serveur. La route POST contrôle
l'origine et les mêmes droits administrateur. Le journal ionos_delivery_tests
est réservé au service serveur (RLS sans politique client, droits client révoqués).
Une insertion unique (tenant, version du test) réserve l'envoi avant SMTP.
Une erreur ou un arrêt du processus ne libère jamais cette réservation :
aucun réessai automatique après résultat SMTP ambigu. L'acceptation SMTP
n'est pas présentée comme une preuve de réception.

Attention : LFI est un projet dans le tenant principal Atlas. La configuration
tenant de ce diagnostic ne constitue PAS un routage global pour les campagnes.
L'intégration future doit sélectionner explicitement le projet LFI et préserver
les campagnes Brevo NEOS/VendreSonCommerce.

Le test ne valide pas les modèles marketing, l'import IMAP, les désinscriptions
ou la délivrabilité d'une campagne. Aucun envoi commercial n'est activé.
