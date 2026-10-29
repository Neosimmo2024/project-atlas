# Validation VendreSonCommerce — 28 octobre 2026

Branche : `feature/vsc-campaign-engine-foundation`, PR #88 (dépend de #87).
Les campagnes restent désactivées. Aucun traitement périodique ne lance le worker de réponses. Une action manuelle réservée aux administrateurs VSC permet de traiter un lot sans envoyer de message.

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
Le quota Vercel est levé après passage à une offre payante. La prévisualisation du commit 03b2472 est READY sur l’alias de branche. Les six migrations VSC sont installées en QA et les scénarios SQL y passent avec ROLLBACK. Aucune promotion ni mise en production n'est autorisée.

## Intégration applicative sur base jetable

`vsc-reply-flow.integration.test.ts` exerce les vrais services TypeScript, le client REST Supabase et la RPC d'annulation. Seule la collecte OVH est simulée ; le transport email est interdit. Le test refuse tout hôte autre que Supabase local sur le port 54321, exige un indicateur explicite et crée uniquement des entreprises et contacts fictifs dans l'instance détruite en fin de CI.

Scénarios : plan de brouillons persistant, réponse reconnue, annulation des relances de la bonne entreprise, doublon sans nouvel enregistrement, panne puis reprise, conflit concurrent du point de reprise et refus d'une autre entreprise. Cette vérification ne remplace pas le test réel de la boîte OVH ni celui de la prévisualisation Vercel.

## Avant une activation

- Vérifier le dernier commit déployé sur l’alias de prévisualisation.
- Utiliser uniquement des comptes fictifs pour les scénarios de test ; les identifiants Supabase du QA partagé restent inchangés.
- Vérifier une vraie réponse OVH puis la création du journal et l'arrêt des relances.
- Valider explicitement la planification du worker et, séparément, les envois commerciaux.

Offre inchangée : 79 € HT au lieu de 159 € HT, annonce jusqu'à la vente, promotion jusqu'au 30 novembre 2026.

## Désinscription VSC

Le lien signé HMAC est lié à une entreprise et un contact ; il ne contient pas d'adresse email. GET affiche uniquement une confirmation. POST vérifie l'origine et la signature avant d'enregistrer une opposition persistante dans `vsc_contact_suppressions` et d'annuler atomiquement les relances en attente du canal concerné. Une opposition globale interne annule les deux canaux. Le code ne modifie pas les champs de contact partagés ni les campagnes NEOS.

Le transport email exige maintenant un identifiant de contact, relit son opposition et ses réponses dans la base, vérifie l'adresse destinataire et ajoute un lien de désinscription au texte et au HTML. Une erreur de contrôle ou une configuration incomplète bloque le transport.

Deux paramètres supplémentaires sont requis avant un test réel d'envoi : `VSC_UNSUBSCRIBE_SIGNING_KEY` (clé aléatoire dédiée, au moins 32 caractères, à conserver pour les liens déjà émis) et `VSC_PUBLIC_BASE_URL` (origine HTTPS de l'environnement testé). Ils sont préparés uniquement pour la branche de prévisualisation de la PR #88, avec une clé dédiée non exposée. Ils ne sont pas configurés en production. Aucun endpoint d'envoi ni scheduler n'est activé.

## Diagnostic réel de réponse — QA uniquement

La connexion SMTP et le premier aller-retour réel SMTP/IMAP ont été vérifiés dans l'interface le 28 octobre. Le diagnostic de réponse est séparé des campagnes : `VSC_REPLY_SELF_TEST_ENABLED=true`, environnement Vercel preview, projet Supabase QA attendu et propriétaire/administrateur de VSC sont tous requis.

Le diagnostic ne peut envoyer qu'à `contact@vendresoncommerce.com`. Il crée un contact marqué TEST, interdit de prospection, et une campagne brouillon non approuvée. Deux messages techniques sont envoyés avec In-Reply-To/References réels. Le worker normal doit reconnaître la réponse, écrire le journal et annuler la relance fictive. Si la réponse n'est pas encore visible, la reprise ne renvoie aucun message.

Le point initial IMAP ne peut être avancé que lorsqu'aucun envoi VSC historique n'existe. Aucun test ne peut donc sauter une ancienne réponse de campagne. Les données de cette vérification sont identifiables par la source `vsc-reply-self-test` et le nom `[TEST TECHNIQUE OVH] Réponse et arrêt des relances` ; elles sont à supprimer de façon ciblée après collecte de la preuve. Le point de reprise peut être conservé. Le diagnostic reste désactivé en production et n'active aucun scheduler.

La page de désinscription utilise `Referrer-Policy: strict-origin` : le chemin et le jeton ne sont pas transmis comme référent, et le navigateur conserve l’origine du formulaire HTTPS pour le contrôle anti-CSRF. `no-referrer` rendait cette origine nulle lors du POST natif. Référence : https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header .

## Résultat de la recette réelle

Le 28 octobre 2026, trois messages techniques ont été envoyés exclusivement à notre propre boîte contact@vendresoncommerce.com : un aller-retour simple et deux messages liés par In-Reply-To/References. Le worker a enregistré une réponse et annulé la relance fictive. Le formulaire de désinscription a créé l’opposition email persistante après confirmation POST ; GET n’a rien modifié. Les contacts, campagnes, livraisons, journaux et oppositions fictifs ont ensuite été supprimés de façon ciblée. Le point de reprise IMAP a été conservé.

La CI du commit 03b2472 a réussi : 634 tests unitaires et 7 tests d’intégration sur Supabase local jetable. Aucun SMS réel n’a été envoyé. Aucun envoi commercial ni tâche périodique n’est activé.

## Traitement manuel des réponses

La page administrateur OVH propose une simulation et, séparément, le traitement réel d’un lot. POST `/api/admin/vsc-reply-sync` exige une origine identique, une session et un rôle propriétaire/administrateur dans le tenant VSC configuré côté serveur. Le client ne choisit pas l’entreprise. Le résultat contient les compteurs et `hasMore` ; chaque lot suivant exige un clic explicite. Une erreur ne provoque aucun nouvel essai automatique. Le worker existant conserve les garanties d’idempotence et de reprise.

Cette action ne crée ni contact de test ni email, ne programme aucune tâche et n’active aucune campagne. La planification périodique et les envois commerciaux restent à valider séparément.

## Date réelle d’envoi et fin de promotion

La date prévue ne suffit pas à autoriser un envoi retardé : le transport email vérifie également l’horloge serveur en Europe/Paris, avant les accès externes puis immédiatement avant SMTP. À partir du 1er décembre 2026 à 00:00 à Paris, l’envoi promotionnel est refusé même si sa date planifiée était antérieure. Le contrôle ne dépend d’aucune date envoyée par le navigateur. Une vérification en base qui franchit minuit ne permet pas de contourner ce refus.

La planification, la persistance des brouillons et le précontrôle partagent une validation stricte des jours du calendrier : le 31 février et le 29 février 2026 sont refusés. La date limite de l’offre est centralisée dans la politique VSC. Aucun envoi réel n’est effectué par ces tests.

## Autorisation de contact actuelle

Le contrôle serveur précédant SMTP exige désormais `people.contact_allowed = true`, en plus de l’absence d’opposition globale, de désinscription et de réponse connue. Une autorisation fausse, absente ou illisible bloque l’envoi. Le scénario de révocation est vérifié avec une vraie mise à jour sur Supabase local jetable ; il ne modifie aucun contact réel. La préparation technique ne vaut pas autorisation de lancement : voir [la revue avant lancement](vsc-release-review.md).

## Interface de préparation des brouillons email

`/admin/vsc-campaigns` est réservée aux administrateurs VSC et accessible depuis le diagnostic OVH. Jusqu’à 100 contacts éligibles sont proposés ; la sélection est explicite. Le nom, la date de départ et les contacts produisent un aperçu email J0/J+20/J+40, avec retrait des étapes après le 30 novembre. Un changement de coordonnées, de sélection ou de paramètres impose un nouvel aperçu. Les textes commerciaux restent à préparer et à valider ; aucun contenu n’est envoyé.

La migration `20261028163613_vsc_atomic_email_draft.sql` ajoute deux fonctions `security invoker` à search_path vide, exécutables uniquement par service_role. La sélection utilise NOT EXISTS pour les oppositions et réponses, sans troncature d’un historique volumineux. La sauvegarde crée campagne et livraisons dans une transaction, vérifie à nouveau les contacts et conserve uniquement l’état draft. La même demande est idempotente ; un autre contenu avec le même identifiant est refusé. Un contact étranger invalide toute la transaction.

Les dates restent des propositions de relecture, sans programmation chez un prestataire. Aucun nouveau droit d’activation ni transport commercial n’est introduit. Les tests SQL sont transactionnels avec ROLLBACK ; les scénarios applicatifs utilisent exclusivement Supabase local jetable.

## Textes des brouillons et relecture

Les trois étapes email disposent de propositions en texte simple reprenant l’offre convenue. Objets et corps sont modifiables avant aperçu, avec limites de taille et refus des retours à la ligne dans l’objet. Les messages réellement présents dans le plan sont affichés avant sauvegarde. Toute modification de texte invalide l’aperçu précédent.

La migration `20261028165747_vsc_draft_email_content.sql` ajoute une copie des textes sur la campagne et une RPC invoker réservée au serveur, qui encapsule la création atomique existante. Un nouvel essai avec la même identité et les mêmes textes reste idempotent ; une autre copie sous cette identité est refusée. La version enregistrée est relue depuis la base et n’est pas régénérée à partir des modèles courants. Les anciens brouillons conservent un contenu nul et sont signalés comme tels. Aucune donnée existante n’est préremplie ou approuvée.

La relecture impose le tenant VSC côté serveur et n’expose aucun brouillon d’un autre espace. La désinscription reste ajoutée par le transport seulement lors d’un envoi explicitement autorisé ; les textes préparatoires ne contiennent aucun jeton de désinscription réel. L’édition et la sauvegarde ne valent pas validation commerciale.

## Réservations email et résultats incertains

La migration `20261028180046_vsc_email_delivery_claims.sql` prépare des primitives serveur sans appel de prestataire : réservation atomique d’une livraison email précise, début de tentative unique et enregistrement idempotent du résultat. Elles exigent une campagne active explicitement approuvée, une date échue dans la période de promotion, une copie des textes et un contact toujours autorisé sans opposition ni réponse. Elles ne peuvent activer une campagne ni transformer un brouillon en livraison programmée.

Le début relit les conditions et compare l’adresse et le contenu à la version réservée. Un changement annule la tentative avant SMTP. Un jeton erroné ou périmé est refusé. Une réservation peut être libérée uniquement tant qu’aucun début de tentative n’a été enregistré ; le prochain essai reçoit un autre jeton. Après ce début, aucune expiration ne libère automatiquement la livraison. Un résultat inconnu reste claimed/unknown, sans redémarrage ni changement automatique de résultat ; il nécessite une vérification humaine distincte, non implémentée ici.

Les jetons et le contenu réservé sont lisibles seulement par le serveur ; les colonnes de suivi précédemment lisibles conservent leur accès RLS. Le tableau montre les réservations et résultats incertains via des compteurs serveur. Les RPC sont invoker à search_path vide et interdites à anon/authenticated. Aucun endpoint ni scheduler n’utilise ces services. Le raccordement ultérieur à un adaptateur SMTP désactivé est décrit plus bas.

Les tests SQL sont transactionnels avec ROLLBACK. Les tests d’intégration exercent deux réservations/débuts concurrents, une opposition après réservation, un résultat incertain, l’idempotence du résultat et l’invalidation d’un ancien jeton, uniquement sur Supabase local jetable. Un compte d’approbateur fictif y est créé directement par l’API admin locale avec email auto-confirmé, sans invitation. Après la fin de promotion, les scénarios positifs de réservation sont explicitement ignorés ; le refus lié à l’horloge réelle de la base reste testé. Aucun envoi SMTP n’est autorisé dans ces tests.

Limite de cette étape : le transport OVH devra utiliser exactement le messageId réservé et refaire son contrôle d’opposition juste avant l’appel fournisseur. La classification des erreurs SMTP et la résolution des résultats incertains ne sont pas encore raccordées. Cette préparation ne constitue pas un moteur d’envoi activé et n’établit aucune nouvelle cadence d’envoi.

## Adaptateur SMTP réservé — désactivé

`dispatchReservedVscEmail` relie réservation, début de tentative, contrôle frais du statut et du contenu en base, transport OVH et résultat. Aucun endpoint, bouton ou scheduler ne l’appelle. `VSC_EMAIL_DISPATCH_ENABLED` doit être exactement `true` ; cette variable est absente des métadonnées du projet Vercel QA lors de la vérification. Elle n’a pas été créée. Le transport historique non réservé reçoit la même barrière, pour éviter une activation indirecte.

La préparation du lien signé et du transport précède le début. Un échec prouvé avant ce début libère la réservation ; un début dont la réponse est perdue ne déclenche ni SMTP ni libération automatique. Le statut et la copie réservée sont relus avant SMTP. Un blocage local certain à ce stade est enregistré comme rejet sans acceptation, sans appel fournisseur. Une erreur de persistance du résultat demande une vérification et ne déclenche aucun nouvel essai.

L’adaptateur impose le messageId réservé, l’expéditeur et le reply-to VSC, une enveloppe avec un seul destinataire et le lien de désinscription signé. Il ne prend aucun texte, destinataire ou expéditeur depuis une requête HTTP. Les listes d’adresses, caractères de contrôle et identités incohérentes sont refusés. Un reçu n’est reconnu comme accepté que si le serveur confirme l’unique destinataire, l’identifiant prévu et une réponse 2xx. Cela prouve l’acceptation SMTP, pas une livraison finale dans la boîte du destinataire.

Un refus est considéré certain uniquement avec les métadonnées cohérentes d’un rejet SMTP 4xx/5xx à une étape d’enveloppe/DATA. Une coupure, un timeout, une réponse incomplète ou une identité inattendue reste unknown, bloquée sans renvoi. Références techniques : [transport SMTP Nodemailer](https://nodemailer.com/smtp) et [structure des erreurs](https://nodemailer.com/errors). Cette classification est volontairement prudente et ne suit pas une simple règle « exception = message non envoyé ».

Les nouveaux tests d’intégration utilisent les vrais services et RPC Supabase sur localhost jetable ; le transport Nodemailer est remplacé par une fonction simulée, interdite hors scénarios explicitement marqués. Ils vérifient l’acceptation avec lien signé, le refus prouvé, le timeout incertain et l’absence de seconde soumission. Aucun message n’est adressé à OVH, Brevo ou un contact réel pendant ces tests. Le test OVH réel antérieur reste distinct de cette validation simulée de l’adaptateur.

## Point d’entrée de planification des réponses OVH — 29 octobre 2026

`GET /api/cron/vsc-replies` prépare l’appel machine du worker existant. Aucun calendrier Vercel n’est ajouté et aucune variable distante n’est créée. Il refuse toute exécution sauf si `VSC_REPLY_CRON_ENABLED=true`, `CRON_SECRET` contient au moins 32 caractères et le header Authorization correspond exactement à `Bearer <secret>`. Comparaison de condensats de taille fixe, absence de cache et erreurs fournisseur masquées. L’entreprise provient uniquement de `VSC_OVH_TENANT_ID` côté serveur ; aucun paramètre URL n’est utilisé.

Chaque appel traite un seul lot borné, sans boucle sur `hasMore`. Le journal idempotent et le curseur CAS du worker restent les protections de reprise/concurrence : des appels simultanés peuvent lire le même lot, mais ne doivent pas doubler les journaux ni faire reculer le curseur. Une erreur laisse une reprise à un appel ultérieur. Aucun import du transport email ou SMS.

Le middleware laisse uniquement ce chemin exact utiliser son authentification machine, sans lecture de session utilisateur. Les autres routes conservent leurs contrôles existants.

Avant installation d’un calendrier : recetter sur l’environnement isolé autorisé, vérifier le tenant et le point de reprise, préparer une clé aléatoire dédiée dans la configuration du projet, puis prévoir un appel toutes les cinq minutes. Vercel transmet `CRON_SECRET` dans Authorization pour ses cron jobs ; les cron jobs Vercel ne constituent pas une planification de preview. Ne pas ajouter de `crons` à une configuration de production ni activer le drapeau avant la revue du déploiement. Désactiver `VSC_REPLY_CRON_ENABLED` arrête ce point d’entrée sans toucher au traitement manuel ni aux campagnes NEOS IMMO. La collecte reste indépendante de `VSC_EMAIL_DISPATCH_ENABLED` et ne permet aucun envoi.
