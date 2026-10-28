# Vérifications Brevo traçables — 28 septembre 2026

Ce lot prépare l'enregistrement des vérifications des tentatives incertaines. Il ne résout pas une tentative, ne libère pas son verrou et n'active ni synchronisation, ni email, ni SMS. Aucun n8n.

- Base de travail exacte : `3eedb32ae55146377dbd9bbb1496d3d95aa302ee`, PR #69 Draft.
- `inspectAndRecordBrevoContactAttempt` compose la vérification existante en lecture seule et un enregistrement réservé au serveur. L'identité de l'acteur provient de la session ; les droits et le compte sont relus avant l'écriture.
- `record_brevo_contact_check` est SECURITY INVOKER, exécutable seulement par service_role. La fonction verrouille en lecture la ligne d'appartenance et la tentative, revérifie rôle actif, tenant et statut attendu, puis écrit l'observation.
- Table `brevo_contact_checks` : RLS owner/admin en lecture, aucune écriture client, ni UPDATE/DELETE applicatif. Résultats dans une liste fermée, pas de coordonnées, secrets, contenu fournisseur ou texte libre.
- La table conserve une observation datée, pas une preuve de l'auteur d'une création Brevo ni une autorisation de réessayer. Absence de contact et résultat positif conservent tous les verrous existants. Les suppressions administratives d'un tenant restent soumises aux cascades existantes ; il ne s'agit pas d'un stockage inviolable par un administrateur de base.
- Pas de route, bouton, cron ou variable d'activation ajouté. Liaison serveur du compte Brevo et décision auditée de clôture restent distinctes. Aucun appel Brevo réel pendant les tests.

## Validation locale

- 747 tests unitaires réussis (108 fichiers), dont 21 nouveaux cas d'audit ; TypeScript et ESLint réussis.
- Les suites SQL du journal existant et du nouvel audit passent sur PostgreSQL embarqué PGlite : droits, cloisonnement, révocation, absence de modification de l'historique et conservation des verrous.
- Limites du test embarqué : socle auth minimal, pas de PostgREST/GoTrue ; seule extension pgcrypto omise car UUID natif. La CI Supabase complète reste la validation de référence.
- Simulation de restauration et manifeste de migrations actualisés ; verrou de reset distant inchangé à 0019. Aucun reset distant.

## Installation

Migration additive : `20260928062634_brevo_contact_check_audit.sql`, créée par Supabase CLI. Au précontrôle QA : table absente, 9 personnes, 10 tâches, 0 tentative. Installation distante non encore effectuée lors de la rédaction ; suivre la PR pour le résultat exact de CI, Vercel et de l'installation QA.

## Publication suspendue par le contrôle automatique

Le contrôle automatique d'autorisation a refusé l'affectation temporaire de `BREVO_INBOUND_WEBHOOK_SECRET` à `agent/security-hardening-2026-09-26`, estimant que ce changement d'accès sensible n'était pas spécifiquement autorisé. Aucune autre méthode n'a été utilisée pour contourner le refus.

Le domaine `BREVO_RECRUITMENT_INBOUND_DOMAIN`, déjà déplacé avant le refus, a été remis sur `agent/v1-pilot-renato-stabilization-lot-9i` et vérifié dans Vercel. Le secret webhook et la clé API Preview n'ont pas été déplacés. Pas de push, de construction Vercel, de migration distante ni de contrôle Brevo réel. Une autorisation précise pour les trois paramètres Preview est nécessaire avant reprise de la publication QA ; aucun changement de valeurs, de paramètres communs ou de production n'est prévu.
