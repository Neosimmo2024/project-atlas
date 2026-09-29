# Raccordement du diagnostic Brevo — préparation du 26 septembre

## État constaté

- Compte navigateur Brevo NEOS IMMO confirmé.
- Projet QA : `prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon`, Supabase `mahgxumwucxehsooijag`.
- Le secret du webhook et la surcharge de clé API Brevo sont limités à la branche `agent/v1-pilot-renato-stabilization-lot-9i` dans Vercel.
- Le diagnostic est sur `agent/security-hardening-2026-09-26` (PR #69).
- Aucune valeur secrète lue, copiée ou renouvelée. Aucune configuration distante modifiée par cette préparation. Cron QA arrêté.
- L'autorisation d'un seul email de test à Renato est inutilisée. Sa fiche Gmail existante est arrêtée et marquée ne pas contacter. Ne pas effacer cet historique ni remettre la séquence à zéro pour contourner les contrôles.

## Procédure préparée

`scripts/repin-brevo-diagnostic.mjs` est appelé au prebuild, mais ne fait aucun appel réseau sans activation explicite. Ses tests utilisent uniquement des réponses simulées.

1. Résoudre le périmètre des secrets : faire approuver la réaffectation temporaire des variables Brevo à la branche de sécurité du même projet QA, ou utiliser une autre méthode autorisée conservant leur confidentialité. Ne jamais sélectionner toutes les branches ni Production. Restaurer les périmètres initiaux après le déploiement ciblé.
2. Déployer le commit validé avec ces variables. Confirmer via Vercel l'identité du projet, le SHA, l'environnement preview et l'état READY. Conserver son URL immuable, pas un alias de branche.
3. Laisser le cron arrêté. Préparer une séquence de test autorisée selon les règles métier existantes ; l'envoi reste une opération distincte. Configurer la capture ciblée et son expiration lorsque l'utilisateur est prêt à répondre.
4. Sur une exécution de maintenance du même projet et de la même branche, fournir `ATLAS_DIAGNOSTIC_REPIN=qa-url-only`, `ATLAS_DIAGNOSTIC_REPIN_TARGET` (URL immuable vérifiée + `/api/internal/recruitment-email/inbound`) et `ATLAS_DIAGNOSTIC_REPIN_UNTIL` (UTC à moins d'une heure). Ne pas activer tant que la cible n'est pas déployée et contrôlée.
5. La procédure lit le webhook inbound de `reply.neos-immo.com`, exige un résultat unique, son ancien URL exact et le secret attendu. Elle sonde la cible avec `{items:[]}` : aucun email, événement métier ou tâche ne doit être créé. Puis elle modifie uniquement `url` et relit tous les paramètres. Un résultat `VERIFICATION_REQUIRED` exige une inspection, jamais une répétition aveugle.
6. Retirer les variables de maintenance après succès. Le changement de destination persiste : son expiration ne restaure pas l'ancien webhook. Conserver l'ancien URL dans ce document et utiliser la procédure de retour contrôlée si nécessaire, avec comparaison du webhook courant avant toute écriture.
7. Exécuter le test email séparément, vérifier la collecte, puis retirer les variables de capture et uniquement les métadonnées diagnostiques du test selon le runbook de sécurité. Ne pas déclarer les résultats SPF/DKIM/DMARC fiables sans garantie de leur provenance par Brevo.

Ancienne cible documentée par le script pilote :
`https://project-atlas-qa-beta-1-2kc3xe013-neos-immo.vercel.app/api/internal/recruitment-email/inbound`

Le script refuse tout autre ancien raccordement ; une différence nécessite un diagnostic explicite. La présence de ce script n'accorde aucune autorisation de diffuser des secrets à un autre projet, d'envoyer un email supplémentaire, de lever une opposition de contact, de fusionner ou de modifier la production.
