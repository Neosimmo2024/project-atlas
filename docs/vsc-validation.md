# Validation VendreSonCommerce — 28 octobre 2026

Branche : `feature/vsc-campaign-engine-foundation`, PR #88 (dépend de #87).
Les campagnes restent désactivées. Aucun traitement périodique ni route publique ne lance le worker de réponses.

## Réponses OVH

`reconcileVscRepliesOnce` traite un lot de 200 identifiants UID au maximum dans INBOX, ouverte en lecture seule. Le résultat `hasMore` indique si un autre lot est nécessaire.
Une session IMAP est bornée à 45 secondes, avec délais de connexion et limites de réponse. Une erreur de connexion ou une lecture tronquée invalide le lot.
Le point de reprise est conservé par entreprise dans `vsc_imap_cursors`, accessible uniquement au serveur. Il avance après l'enregistrement de toutes les réponses du lot. Une panne laisse le point précédent intact ; les doublons du journal sont sans effet. Une version compare-and-swap refuse l'écrasement concurrent d'un point de reprise. Un changement UIDVALIDITY reprend la lecture depuis le début.

Les références des réponses sont rapprochées des identifiants exacts des envois VSC par lots de 100 références, avec pagination de l'historique. Le traitement ne se limite plus aux 100 derniers messages ni aux 500 premières livraisons. Le panneau d'aperçu conserve sa fenêtre limitée et ne modifie pas le point de reprise.

## Base isolée

Branche Supabase : `vsc-isolated-validation`, projet `bmqtengtbhqveyjnbkkl`, parent QA `mahgxumwucxehsooijag`. Créée sans données. Les migrations du dépôt y ont été appliquées manuellement après l'échec de l'initialisation automatique ; les versions enregistrées par l'outil distant diffèrent des noms de fichiers. Ne pas fusionner cette branche de validation dans le parent.

`supabase/tests/vsc-isolation.sql` utilise uniquement des données fictives et termine par ROLLBACK. Il vérifie l'isolation par entreprise, les clés étrangères composites, les droits RPC, la révocation d'accès d'un membre suspendu, l'idempotence, l'arrêt des relances et le refus d'un point de reprise périmé.

La migration `vsc_service_role_grants` rend explicites les droits serveur nécessaires. Les droits DML présents avec le CLI local n'étaient pas tous présents sur les tables VSC distantes. Le rôle serveur conserve uniquement SELECT/INSERT/UPDATE sur campagnes, livraisons et points de reprise, SELECT/INSERT sur le journal.

L'audit Supabase signale l'absence de politique sur le point de reprise : c'est volontaire, aucun accès anon/authenticated n'est accordé. Les autres avertissements concernent les fonctions historiques Atlas ; leur traitement est distinct de VSC et ne justifie aucune modification des campagnes NEOS IMMO.

## Prévisualisation Vercel

Projet QA : `project-atlas-qa-beta-1`.
Les variables VSC_OVH_TENANT_ID et VSC_OVH_SMTP_PASSWORD de prévisualisation ont été transférées de la branche #87 à celle de #88, sans lecture ni changement des valeurs. La collecte IMAP utilise le mot de passe IMAP dédié s'il existe, sinon celui SMTP.
Le nouveau déploiement reste soumis au quota journalier Vercel (402 api-deployments-free-per-day). L'ancienne prévisualisation ne contient pas les nouveaux correctifs. Aucune promotion ni mise en production n'est autorisée.

## Intégration applicative sur base jetable

`vsc-reply-flow.integration.test.ts` exerce les vrais services TypeScript, le client REST Supabase et la RPC d'annulation. Seule la collecte OVH est simulée ; le transport email est interdit. Le test refuse tout hôte autre que Supabase local sur le port 54321, exige un indicateur explicite et crée uniquement des entreprises et contacts fictifs dans l'instance détruite en fin de CI.

Scénarios : plan de brouillons persistant, réponse reconnue, annulation des relances de la bonne entreprise, doublon sans nouvel enregistrement, panne puis reprise, conflit concurrent du point de reprise et refus d'une autre entreprise. Cette vérification ne remplace pas le test réel de la boîte OVH ni celui de la prévisualisation Vercel.

## Avant une activation

- Déployer le commit validé en prévisualisation lorsque le quota le permet.
- Préparer un environnement de bout en bout avec des comptes fictifs et la base isolée ; ne pas rediriger les secrets Supabase du projet QA partagé.
- Vérifier une vraie réponse OVH puis la création du journal et l'arrêt des relances.
- Valider explicitement la planification du worker et, séparément, les envois commerciaux.

Offre inchangée : 79 € HT au lieu de 159 € HT, annonce jusqu'à la vente, promotion jusqu'au 30 novembre 2026.
