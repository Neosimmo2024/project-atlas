# Pilote manuel d’un contact fictif — 29 septembre 2026

Autorisation utilisateur : tester une fiche Atlas vers un contact Brevo, puis vérifier qu’un second clic ne crée aucun doublon, sans email ni SMS.

Le bouton QA appelle une Server Action avec confirmation explicite. Le serveur impose le projet Preview QA, le tenant et l’organisation Brevo précédemment confirmés, le rôle propriétaire et un identifiant de personne fixe (`3bc14f68-31ea-4974-a547-01f918a79c4a`). La fiche doit conserver exactement l’adresse fictive `atlas-pilot-20260929@example.invalid`. Aucun identifiant de personne, clé ou compte envoyé par le navigateur n’est accepté.

Le moteur existant conserve ses vérifications d’identité, de collision email, de session et son verrou de journal. Le POST initial ajoute `emailBlacklisted: true` et `smsBlacklisted: true`, sans liste, téléphone, fusion ni mise à jour de contact existant. Aucune API d’envoi n’est appelée. Le serveur relit ensuite l’identité et les deux blocages. Après une création réussie dans le journal, les clics suivants effectuent uniquement une lecture et comparent l’identifiant Brevo initial ; même une suppression externe ne permet pas de recréer le contact.

Validation locale : 864 tests sur 114 fichiers, TypeScript et ESLint. Les tests couvrent le second clic, la suppression externe, le compte inattendu, les droits révoqués, la fiche altérée, l’issue incertaine et le blocage des deux canaux dans le POST initial. Les tests sont exécutés avec TZ=UTC comme la CI ; deux tests préexistants du module Projets supposent ce fuseau et échouent sous le TZ=Asia/Tokyo de cet environnement.

Aucune migration ni activation de synchronisation générale. Le résultat du parcours réel sera consigné dans la PR après déploiement.
