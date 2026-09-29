# Pilote manuel d’un contact fictif — 29 septembre 2026

Autorisation utilisateur : tester une fiche Atlas vers un contact Brevo, puis vérifier qu’un second clic ne crée aucun doublon, sans email ni SMS.

Le bouton QA appelle une Server Action avec confirmation explicite. Le serveur impose le projet Preview QA, le tenant et l’organisation Brevo précédemment confirmés, le rôle propriétaire et un identifiant de personne fixe (`3bc14f68-31ea-4974-a547-01f918a79c4a`). La fiche doit conserver exactement l’adresse fictive `atlas-pilot-20260929@example.invalid`. Aucun identifiant de personne, clé ou compte envoyé par le navigateur n’est accepté.

Le moteur existant conserve ses vérifications d’identité, de collision email, de session et son verrou de journal. Le POST initial ajoute `emailBlacklisted: true` et `smsBlacklisted: true`, sans liste, téléphone, fusion ni mise à jour de contact existant. Aucune API d’envoi n’est appelée. Le serveur relit ensuite l’identité et les deux blocages. Après une création réussie dans le journal, les clics suivants effectuent uniquement une lecture et comparent l’identifiant Brevo initial ; même une suppression externe ne permet pas de recréer le contact.

Validation locale : 864 tests sur 114 fichiers, TypeScript et ESLint. Les tests couvrent le second clic, la suppression externe, le compte inattendu, les droits révoqués, la fiche altérée, l’issue incertaine et le blocage des deux canaux dans le POST initial. Les tests sont exécutés avec TZ=UTC comme la CI ; deux tests préexistants du module Projets supposent ce fuseau et échouent sous le TZ=Asia/Tokyo de cet environnement.

Aucune migration ni activation de synchronisation générale.

Parcours réel : Brevo a créé le contact 334, avec l’EXT_ID attendu. Le second clic a conservé une seule opération `created` dans le journal. L’interface Brevo confirme la fiche, les campagnes email blocklistées et l’absence de téléphone ; les emails transactionnels restent indiqués « Abonné ». Aucun envoi n’a été déclenché. Ne pas assimiler `emailBlacklisted` à un blocage de tous les emails transactionnels.

La confirmation de tous les canaux n’a pas abouti. Le pilote distingue désormais une identité retrouvée du blocage incomplet des canaux, sans nouvelle écriture ni assouplissement de la condition de blocage complet. Le contrôle ajouté porte le total local à 865 tests ; TypeScript reste valide. Le contact fictif et son journal sont conservés pour revue. La synchronisation automatique reste inactive.

## Correction des canaux après ce constat

Le blocage transactionnel manuel du contact 334 a été confirmé dans Brevo, et la CI #376 est entièrement verte. La correction suivante remplace le contrôle pilote fondé uniquement sur les deux indicateurs marketing :

- L’identité est relue par EXT_ID et comparée à l’identifiant du journal `created`, ainsi qu’à l’adresse fictive exacte. Aucun contact préexistant sans identifiant enregistré n’est adopté.
- Le pilote sans téléphone exige des attributs présents et un champ SMS absent ou vide. Il affiche « SMS : sans numéro », sans prétendre avoir testé un SMS réel. Un numéro ajouté arrête le pilote.
- Les expéditeurs Brevo sont relus, puis la liste des blocages transactionnels est vérifiée pour chacun. Si nécessaire, un PUT de restriction `emailBlacklisted: true` et `smtpBlacklistSender` est effectué sur l’identité exacte. Aucun POST de contact supplémentaire ni API d’envoi, changement d’email, liste, abonnement ou numéro n’est utilisé.
- Après une éventuelle restriction, les contacts, les expéditeurs et leurs blocages sont relus. Une autorisation propriétaire fraîche est requise avant chaque requête et en fin de contrôle. Les erreurs, données incomplètes, changements d’expéditeur et délais dépassés ne déclenchent aucune relance automatique.
- La confirmation porte explicitement sur les expéditeurs actuellement déclarés, pas sur de futurs expéditeurs ni sur le parcours transactionnel SMS. Le périmètre reste l’unique fixture QA.

Validation locale : 882 tests / 115 fichiers, TypeScript et lint réussis. Les tests vérifient notamment l’écriture automatique des blocages absents, la relecture indépendante, le second contrôle sans écriture, les refus d’identité/téléphone/autorisation, le timeout sans retry et le refus d’un simple HTTP 204 non confirmé par relecture.

Références API : `GET /v3/senders`, `PUT /v3/contacts/{identifier}?identifierType=ext_id`, `GET /v3/smtp/blockedContacts?senders=...`, documentation officielle Brevo consultée le 29 septembre 2026. Le GET contact définit emailBlacklisted/smsBlacklisted comme des indicateurs de campagnes.
