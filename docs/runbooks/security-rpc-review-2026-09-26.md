# Revue des fonctions privilégiées — 26 septembre 2026

Périmètre : Atlas QA Beta 1, fonctions public SECURITY DEFINER exécutables par authenticated. Revue des 18 définitions réellement déployées après la migration de durcissement. Aucune opération sur la production, aucun envoi Brevo.

## Contrôles observés

| Fonctions | Autorisation et portée |
| --- | --- |
| is_tenant_member, has_tenant_role | Identité auth.uid(), appartenance active et rôle dans le tenant demandé. Ne renvoient qu'un booléen. |
| list_tenant_members_for_admin | Compte authentifié, appartenance active unique, rôle owner/admin ; liste limitée à son tenant. |
| manage_tenant_member | Rôle owner/admin, cible dans son tenant, protection du dernier owner, interdiction pour admin de promouvoir owner. Correction : même refus de contexte multi-tenant que la fonction de liste ; rejet explicite des actions/rôles NULL. |
| assign_relationship_owner | Rôle owner/admin dans le tenant ; relation et responsable vérifiés dans ce tenant. |
| set_relationship_do_not_contact | Rôle owner/admin/recruiter/manager ; relation et personne limitées au tenant ; justification requise. |
| transition_recruitment_pipeline | Rôle et tenant vérifiés ; retour depuis signature réservé owner/admin. Correction : confirmation strictement TRUE, à l'entrée et à la sortie de signature, y compris lors d'un appel RPC direct avec NULL. |
| save_talent_qualification | Personne accessible dans le tenant ; rôle owner/admin/recruiter/manager ; acteur dérivé de auth.uid(). |
| create_recruitment_email_template_version | Rôle owner/admin dans le tenant ; acteur dérivé de auth.uid(). |
| activate_recruitment_email_template_version, mark_recruitment_email_template_sync_error | Rôle owner/admin vérifié dans le tenant de la version. |
| claim_initial_recruitment_email | Rôle de recrutement dans le tenant de la personne ; règles de contact vérifiées. |
| complete_initial_recruitment_email, stop_initial_recruitment_email | Rôle de recrutement dans le tenant de la séquence ; état contrôlé. |
| schedule_recruitment_email_step, stop_recruitment_email_sequence_engine | Rôle de recrutement dans le tenant de la séquence ; contrôles des étapes, dates et règles de contact. |
| analyze_csv_import_cancellation, cancel_csv_import | Rôle owner/admin et import limité au tenant. Correction : comparaison d'acteur avec IS DISTINCT FROM pour rejeter aussi NULL. Confirmation d'annulation déjà strictement TRUE. |

Les privilèges d'exécution authentifiés sont intentionnels pour ces opérations et les helpers RLS. Les alertes Supabase correspondantes ne sont donc pas supprimées en désactivant ces fonctions. Cette revue n'est pas une preuve d'absence de toute vulnérabilité.

## Validation ajoutée

Le script transactionnel scripts/test-security-hardening.sql vérifie les confirmations TRUE/NULL/FALSE, les effets inchangés après rejet, le refus d'un acteur d'import NULL, les droits reader/admin, l'isolation entre tenants et le contexte administratif ambigu. Les fixtures sont fictives et annulées ; exécution uniquement dans le Supabase local de CI. Les tests d'intégration existants couvrent les autres parcours et règles RLS.

## Limites et suites

- La protection des mots de passe compromis est activée en QA et son alerte Supabase a disparu (contrôle du 26 septembre).
- Les états de synchronisation/envoi Brevo restent déclarables par les rôles métier autorisés via RPC ; la vérification de la preuve fournisseur est effectuée par les services applicatifs, pas par PostgreSQL. Un durcissement réservant ces écritures de résultat au serveur demande une évolution coordonnée des services et RPC.
- La CSP des scripts utilise désormais un nonce aléatoire par réponse, transmis au rendu Next.js après remplacement de toute valeur fournie par le client. Les scripts inline sans nonce sont interdits ; unsafe-eval reste limité au développement. Les pages sont rendues dynamiquement pour éviter de réutiliser un nonce mis en cache, ce qui augmente le travail serveur pour les anciennes pages publiques statiques. Les styles inline restent autorisés pour préserver les styles React existants. SPF/DKIM reste à vérifier. Le module Supabase privilégié est marqué server-only ; le mock de ce marqueur est strictement réservé à Vitest.
- Le cron QA reste arrêté et les cibles webhook/cron du pilote restent inchangées.

Référence : https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable

## Validation des scripts et du serveur

La CI exécute désormais les parcours navigateur avec next start après compilation. Le test security-csp.e2e.spec.ts vérifie les nonces des scripts Next.js, leur renouvellement et le blocage effectif d’un script inline injecté sans nonce. Les tests du middleware couvrent aussi le remplacement des en-têtes fournis par un client et la présence de la politique sur redirection/refus CSRF.

## Diagnostic d'une prochaine réponse pilote (préparé, inactif)

Le message sortant du 25 septembre à 17:04 a passé SPF/DKIM/DMARC chez Gmail.
Sa réponse à 17:20 est arrivée dans Atlas, classée sender_mismatch car elle venait
de l'adresse principale plutôt que de l'alias +atlasqa. La séquence est arrêtée.
L'authentification SMTP de cette réponse chez Brevo n'est pas établie par ces faits.

Un diagnostic opt-in collecte seulement Authentication-Results,
ARC-Authentication-Results et Received-SPF dans les métadonnées de l'événement
existant, sous inbound_auth_diagnostic. Chaque nom est limité à deux valeurs de
2048 caractères. Aucun corps, pièce jointe, cookie ou en-tête d'autorisation n'est
ajouté par ce diagnostic. Les valeurs restent du texte non fiable, sans décision
de sécurité fondée sur « pass » ; un expéditeur divergent reste à vérifier.

Activation possible uniquement sur le projet Vercel QA
prj_V0z2DwPzzhgWJxuv7iEEHWMG2yon, en preview, avec l'URL Supabase QA exacte :
- ATLAS_INBOUND_DIAGNOSTIC_SEQUENCE_ID : UUID d'une seule séquence de test autorisée ;
- ATLAS_INBOUND_DIAGNOSTIC_UNTIL : date ISO d'expiration UTC, à moins d'une heure.

Ces variables ne sont pas configurées par ce lot. Le webhook pilote reste sur
son ancien déploiement. Avant tout test réel : autoriser l'email et la réponse,
préparer la séquence fictive, pointer le webhook sur la version QA validée avec
son secret inchangé, puis vérifier le ciblage. Ne pas rejouer le message historique :
son idempotence empêche une nouvelle collecte. Garder le cron désactivé.

Après le test : lire seulement l'événement de cette séquence via un accès autorisé,
confronter les noms de récepteurs et les résultats aux garanties de Brevo avant
leur interprétation, retirer les deux variables et supprimer la seule clé
inbound_auth_diagnostic de l'événement ciblé après consignation d'un bilan sans
valeurs brutes. L'expiration arrête la collecte mais ne supprime pas les preuves
déjà enregistrées. La visibilité de ces métadonnées reste celle du tenant QA.
La collecte ne lève pas à elle seule la réserve d'authentification des réponses.
