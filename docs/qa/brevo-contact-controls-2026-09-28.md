# Contrôles manuels Brevo — QA, 28 septembre 2026

Les Server Actions authentifiées raccordent la vérification d’une tentative et la clôture de revue aux formulaires de l’historique. Les identifiants fournis par le navigateur restent non fiables : droits, tenant, état et confirmation sont vérifiés dans les repositories et RPC existants. Seules des chaînes de résultat prédéfinies sont rendues. Aucune écriture Brevo, relance ou libération du verrou n’est ajoutée.

Un diagnostic explicite, réservé au propriétaire du tenant QA et au projet Vercel Preview QA, lit `/v3/account` avec la clé installée. Il compare l’email de connexion au compte `contact@neos-immo.com`, confirmé indépendamment auparavant. Il ne retourne que l’identifiant d’organisation après concordance et nouvelle vérification de la session. Il ne persiste aucune liaison automatiquement ; la réponse complète (susceptible de contenir des secrets) n’est jamais renvoyée ni journalisée.

Les commandes restent invisibles sans les variables de liaison serveur et les flags distincts de contrôle/revue. Le diagnostic est disponible avant leur configuration afin de lever le blocage d’identification du compte sans extraire la clé existante.

Validation locale : 846 tests (113 fichiers), TypeScript et ESLint. Les nouveaux cas couvrent le périmètre QA, les droits et leur révocation, la minimisation de réponse, le compte inattendu, les erreurs fournisseur, la confirmation explicite et les entrées non fiables des formulaires. La validation du déploiement et du diagnostic réel reste à effectuer au moment de ce commit.

## Diagnostic réel et liaison Preview

Le diagnostic exécuté depuis la page QA sur `cf6b7c5` a confirmé la correspondance avec l’adresse NEOS IMMO attendue et l’organisation `69aae9fea303e8f4220b4e98`. La liaison au tenant QA `8e27b0ff-3f1a-41fa-8390-628c718723a2` et les flags de contrôle/revue ont ensuite été enregistrés uniquement pour la branche `agent/security-hardening-2026-09-26` du projet QA Preview. Aucun flag de synchronisation n’a été activé. Cette mise à jour documentaire déclenche le build qui prendra ces paramètres en compte ; sa validation fonctionnelle reste à effectuer.

## Correction observée en QA

Le premier contrôle réel a révélé des droits manquants pour les RPC `SECURITY INVOKER` : contrairement aux valeurs par défaut locales, le rôle serveur hébergé n’avait pas SELECT sur le journal ni de droit UPDATE permettant de verrouiller les lignes du journal et des rôles. La migration `20260928120500_brevo_contact_service_lock_grants.sql` accorde SELECT et uniquement UPDATE sur des colonnes sans pouvoir de modification des résultats ou des droits (horodatage des rôles/adhésions et ID protégé par le trigger du journal). Elle ne donne aucun droit d’écriture supplémentaire aux utilisateurs.

Les tests SQL de contrôle et de revue retirent désormais les permissions locales larges, réappliquent cette migration et vérifient que le serveur ne peut changer ni les slugs des rôles ni les résultats des tentatives. Les trois suites SQL passent. Après application QA, le bouton a enregistré `outcome_unresolved` pour la tentative fictive, avec acteur courant, état `write_outcome_unknown` conservé et aucune revue créée.
