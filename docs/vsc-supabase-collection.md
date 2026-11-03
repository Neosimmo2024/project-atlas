# Collecte automatique VSC en QA

Supabase Cron appelle toutes les dix minutes le collecteur QA `/api/cron/vsc-collection`. Il traite les réponses exactes OVH, les messages historiques et les STOP SMS du compte Brevo VSC dédié. Aucun transport commercial n'est appelé. Les migrations créent une configuration désactivée ; aucune clé, entreprise ou tâche n'y est installée.

## Authentification et isolation

Une clé aléatoire dédiée de 32 octets, encodée en 64 caractères hexadécimaux, reste exclusivement dans Supabase Vault sous `vsc_collection_signing_key`. Aucun nouveau secret Vercel ni accès SFTP OVH n'est requis. PostgreSQL signe `GET\n/api/cron/vsc-collection\n<timestamp>\n<nonce>` avec HMAC SHA256, en utilisant la représentation textuelle de la clé. Le timestamp expire après cinq minutes. Le nonce n'est utilisable qu'une fois ; un traitement en attente ou en cours empêche un chevauchement pendant dix minutes.

Le service QA soumet la signature à une RPC réservée au rôle service. La clé ne quitte jamais Vault. La configuration privée fixe l'entreprise et un propriétaire/administrateur actif, et le serveur impose son propre tenant VSC. Les tables privées ont RLS et aucun accès navigateur. Les fonctions definer ont un search_path vide. La file réseau reçoit uniquement une signature temporaire, jamais les secrets OVH/Brevo ou la clé de signature.

## Installation opérateur, hors migrations

1. Appliquer et tester les trois migrations de collecte sur isolée puis QA ; vérifier le build de la branche.
2. Générer la clé à l'intérieur de PostgreSQL avec `extensions.gen_random_bytes(32)` et `vault.create_secret`, uniquement si ce nom n'existe pas. Ne jamais retourner sa valeur.
3. Renseigner `vsc_private.collection_settings` avec le tenant VSC et son propriétaire actif, en conservant `enabled=false`.
4. Créer seulement `vsc-collection-10m`, calendrier `*/10 * * * *`, commande `select vsc_private.enqueue_collection();`, et la désactiver dans la même transaction. Ne pas modifier les autres tâches.
5. Activer uniquement la configuration de collecte, lancer `enqueue_collection()` puis vérifier sa réponse réseau et son journal. Une collecte complète exige les trois étapes complètes, zéro statut SMS inconnu et zéro source non rapprochée.
6. Après recette réelle, activer cette seule tâche et vérifier un passage automatique distinct dans son historique Cron et le journal VSC.

La cible réseau est l'alias fixe de la branche QA. Ce dispositif refuse l'environnement de production. Les anciens endpoints de collecte et leurs drapeaux restent indépendants ; les verrous SMTP/SMS ne sont pas activés.

## Surveillance et arrêt

Dans Atlas, « Vérifier la collecte automatique » relit la configuration, la tâche et les dix derniers passages. Un résultat incomplet, échoué, expiré ou trop ancien n'est jamais présenté comme sain. Le journal conserve seulement des compteurs et des dates, sans corps de message ou coordonnées. Un passage complet ne couvre pas une réponse ou opposition reçue ensuite : le contrôle frais avant tout futur envoi autorisé reste obligatoire.

Pour arrêter : désactiver `vsc-collection-10m` et `collection_settings.enabled`. Aucun autre calendrier ou secret ne doit être modifié. Ne pas désactiver la tâche de collecte au motif qu'aucun envoi commercial n'est actif : elle protège aussi les brouillons existants.

Tests SQL transactionnels : `supabase/tests/vsc-collection-scheduler.sql`. Ils utilisent des identités synthétiques, ne commettent pas d'appel réseau et annulent toutes leurs écritures. Ils couvrent droits/RLS, signatures invalides/périmées, nonce consommé, chevauchement, acteur et tenant étrangers, résultats incomplets et consultation du statut.
