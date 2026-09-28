# Contrôles manuels Brevo — QA, 28 septembre 2026

Les Server Actions authentifiées raccordent la vérification d’une tentative et la clôture de revue aux formulaires de l’historique. Les identifiants fournis par le navigateur restent non fiables : droits, tenant, état et confirmation sont vérifiés dans les repositories et RPC existants. Seules des chaînes de résultat prédéfinies sont rendues. Aucune écriture Brevo, relance ou libération du verrou n’est ajoutée.

Un diagnostic explicite, réservé au propriétaire du tenant QA et au projet Vercel Preview QA, lit `/v3/account` avec la clé installée. Il compare l’email de connexion au compte `contact@neos-immo.com`, confirmé indépendamment auparavant. Il ne retourne que l’identifiant d’organisation après concordance et nouvelle vérification de la session. Il ne persiste aucune liaison automatiquement ; la réponse complète (susceptible de contenir des secrets) n’est jamais renvoyée ni journalisée.

Les commandes restent invisibles sans les variables de liaison serveur et les flags distincts de contrôle/revue. Le diagnostic est disponible avant leur configuration afin de lever le blocage d’identification du compte sans extraire la clé existante.

Validation locale : 846 tests (113 fichiers), TypeScript et ESLint. Les nouveaux cas couvrent le périmètre QA, les droits et leur révocation, la minimisation de réponse, le compte inattendu, les erreurs fournisseur, la confirmation explicite et les entrées non fiables des formulaires. La validation du déploiement et du diagnostic réel reste à effectuer au moment de ce commit.
