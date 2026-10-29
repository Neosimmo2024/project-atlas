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

Validation de cette étape : 695 tests locaux réussis, TypeScript et build Next réussis. La preview du commit `eae9afe` est READY ; un GET sans session sur l’alias de branche retourne 503, `Cache-Control: no-store` et « Traitement automatique désactivé ». Les métadonnées Vercel, sans déchiffrement, confirment l’absence de `VSC_REPLY_CRON_ENABLED` et `VSC_EMAIL_DISPATCH_ENABLED`. Aucun appel IMAP ni envoi n’est déclenché par cette vérification. La CI inclut les tests de route et de middleware ; le chemin cron est ajouté au filtre des changements pour les futures modifications.

## Suivi manuel des tentatives ambiguës — 29 octobre 2026

La page `/admin/vsc-campaigns`, après contrôle du rôle propriétaire/administrateur VSC, affiche une lecture serveur des livraisons email claimed avec résultat sending ou unknown. Les tentatives sending peuvent encore être actives : la page demande de recharger avant investigation et ne les déclare pas automatiquement en échec. Les réservations encore reserved sont exclues. La liste expose seulement les identifiants livraison/campagne/contact, la date de début et le messageId déterministe ; ni jeton de réservation, ni payload, ni secret. Limite de 50 lignes avec indicateur de troncature, tri stable par début puis identifiant. Toute erreur est affichée comme indisponibilité, jamais comme une liste vide.

La procédure demande de chercher une preuve d’acceptation/refus correspondant au messageId exact auprès d’OVH. L’absence dans le dossier Envoyés ne constitue pas une preuve de non-envoi SMTP. Sans preuve concluante, conserver le blocage. La page ne propose aucune mutation, résolution ou commande de renvoi ; une future résolution manuelle auditée reste à préparer. Aucun nouvel accès public ni droit SQL n’est ajouté.

La requête de lecture équivalente a été exécutée sur le QA VSC : aucun cas en attente. Aucun enregistrement distant n’a été créé ou modifié. Les tests unitaires vérifient le périmètre, la minimisation des données, la troncature et les erreurs. Un scénario d’intégration sur Supabase local jetable vérifie reserved exclu, sending puis unknown visibles, refus d’un autre tenant et conservation du jeton/statut après lecture ; aucun SMTP appelé.


## Préparation SMS sans transport — 29 octobre 2026

La page administrateur `/admin/vsc-campaigns` propose cinq textes SMS éditables et un aperçu du parcours : email+mobile à J+5 du premier email, ou mobile seul à J0/J+15/J+30/J+45. Les dates invalides, passées ou après la promotion sont refusées ; les étapes après le 30 novembre sont retirées. Toute modification des textes, de la date ou du parcours retire l’aperçu précédent. Aucun destinataire n’est saisi ni sélectionné, aucun appel Brevo n’est effectué, aucune sauvegarde SMS n’est proposée. Les modifications restent explicitement dans la page jusqu’à son rechargement.

Les propositions reprennent 79 EUR HT au lieu de 159 EUR HT, annonce jusqu’à la vente et fin au 30 novembre 2026. Elles utilisent une ponctuation GSM simple. Le repère `[numero STOP VSC]` n’est pas un numéro opérationnel ; le dispositif du compte VSC doit être confirmé séparément. Aucun numéro STOP NEOS n’est réutilisé. Expéditeur, textes et dispositif STOP restent à valider avant raccordement au transport et test sur un numéro autorisé.

Le compteur est une estimation locale du texte exact, repère STOP inclus : GSM-7 160 unités puis 153 par segment, Unicode UTF-16 70 puis 67. Les extensions GSM comptent deux unités ; les caractères d’extension et paires emoji ne sont pas coupés entre segments. Le prix et le décompte final restent à vérifier chez Brevo. Références : [limites de longueur Brevo](https://help.brevo.com/hc/fr/articles/208718649) et [restrictions SMS par pays](https://help.brevo.com/hc/en-us/articles/11884482521234).

708 tests locaux et TypeScript réussis. Les tests ajoutés couvrent les textes, l’absence de réutilisation du STOP NEOS, les deux cadences, les dates limites, la validation du contenu et les frontières GSM/Unicode/emoji. Aucune base distante ni campagne NEOS modifiée par cette étape.


## Sauvegarde et relecture des versions SMS — 29 octobre 2026

La table `vsc_sms_copy_drafts` conserve uniquement nom, date de départ, type de parcours et cinq textes, sans contact, livraison, approbation ni identifiant Brevo. Clé composée tenant/id, RLS active, lecture authenticated limitée aux propriétaires/administrateurs actifs du tenant. Le rôle serveur reçoit SELECT/INSERT seulement : aucune mise à jour ni suppression de version par l’application. La migration a été créée avec le CLI, testée sur la branche isolée puis appliquée au QA. Le test SQL transactionnel vérifie isolation, membre suspendu, lecteur non administrateur et droits. Toutes les fixtures SQL sont annulées. Aucun nouvel avis de sécurité ne mentionne cette table.

`/api/admin/vsc-sms-copies` impose le tenant serveur et le rôle VSC, avec POST même origine, JSON borné et erreurs masquées. Le serveur recalcule la validité des textes/dates avec l’heure de Paris. L’insertion sur conflit ignore le doublon, puis la version est relue et comparée : deux tentatives identiques ne créent qu’une version ; une identité réutilisée avec un autre contenu est refusée. Les objets JSONB sont comparés après canonicalisation, indépendamment de l’ordre de leurs clés.

Le bouton d’enregistrement exige un aperçu et un nom. Une erreur ambiguë conserve l’identifiant pour réessai identique ; une modification le retire et impose un nouvel aperçu. Les champs sont bloqués pendant la sauvegarde. Les vingt dernières versions sont proposées à la relecture ; les textes chargés proviennent de la base. Une modification puis sauvegarde crée une nouvelle version sans écraser l’ancienne. Une panne de liste après sauvegarde ne transforme pas celle-ci en demande de nouvel enregistrement.

713 tests locaux et TypeScript réussis. Tests de route ajoutés : origine, rôle, configuration, format, taille, tenant imposé, cache et erreur sans réessai automatique. Le scénario d’intégration ajouté exerce deux sauvegardes concurrentes avec REST Supabase local jetable, relecture, conflit d’identité et absence de nouvelle livraison ou de SMTP. Le transport SMS, les destinataires et le dispositif STOP VSC restent à finaliser.


## Diagnostic Brevo VSC et repère STOP officiel — 29 octobre 2026

Le profil du navigateur indique contact@vendresoncommerce.com mais les listes montrent aussi des campagnes NEOS IMMO après rechargement (email et SMS). Ne pas déduire d’un nom de profil que les données sont séparées ; aucune campagne existante n’a été modifiée. La séparation du compte fournisseur et celle du tenant Atlas restent deux contrôles distincts.

`inspectVscBrevoSmsAccount` utilise uniquement la clé serveur `VSC_BREVO_API_KEY`, jamais la clé générale de recrutement. Clé absente : aucun appel réseau. Sinon : GET fixe https://api.brevo.com/v3/account, sans cache, sans redirection et avec délai de 8 secondes. Le résultat indique clé absente, identité vérifiée, autre identité ou vérification indisponible. Aucun nom, email tiers, crédit, réponse brute ou secret n’est renvoyé. Tous les résultats maintiennent dispatchEnabled=false. La route est réservée aux propriétaires/administrateurs VSC et ne modifie aucune donnée.

Les métadonnées Vercel, lues sans déchiffrement, confirment l’absence de clé dédiée. Aucun paramètre de compte ni variable n’a été créé. Les nouveaux modèles utilisent [STOP_CODE] conformément à la documentation Brevo, qui annonce son remplacement automatique au moment de l’envoi ; aucun numéro NEOS n’est recopié, aucune ancienne version n’est réécrite. Le compteur reste une estimation incluant le repère, pas une facturation garantie.

Références : [compte Brevo](https://developers.brevo.com/reference/get-account), [désinscription SMS](https://help.brevo.com/hc/fr/articles/115001945670). Les tests couvrent tenant, rôle, clé dédiée sans repli, requête GET bornée, absence de fuite, identité différente et erreurs sans reprise automatique.


## Contacts mobiles VSC en lecture seule — 29 octobre 2026

Migration `20261029101159_vsc_sms_draft_contacts.sql`, créée avec le CLI. Deux fonctions invoker à search_path vide, exécutables uniquement par service_role : normalisation des mobiles français et sélection tenant-scopée. Les formats 06/07, +336/+337 et 00336/00337 sont reconnus après retrait des espaces, points, parenthèses et tirets. Numéros fixes, étrangers, incomplets, multiples, extensions textuelles et notation +33(0) sont refusés plutôt que réparés automatiquement.

La sélection exige contact_allowed=true et do_not_contact=false, puis recherche sur toutes les fiches du même tenant ayant le même mobile normalisé les oppositions all/sms, do_not_contact et journaux de réponse. Une opposition ou réponse sur une variante exclut le numéro entier. Les variantes restantes sont regroupées ; préférence à une fiche disposant d’un email valide et non opposé, puis UUID pour un ordre déterministe. Les oppositions email seules ne bloquent pas le mobile. Aucun champ partagé ni statut de contact n’est modifié.

La réponse est limitée à 101 lignes pour afficher au maximum 100 contacts et signaler une liste partielle. Noms, mobiles normalisés et indication de parcours sont affichés seulement après autorisation propriétaire/administrateur VSC de la page. Toute erreur donne une indisponibilité distincte d’une liste vide. Aucun endpoint d’envoi, aucune sélection persistante ni appel Brevo. Le titre de page couvre désormais les préparations email et SMS.

Migration et tests SQL transactionnels réussis sur la base isolée puis le QA ; fixtures annulées. Scénarios : normalisation, cas refusés, dédoublonnage, préférence email, opposition SMS sur alias, opposition globale sur alias, réponse sur alias, opposition email seule, même numéro dans un autre tenant et droits RPC. La requête réelle QA retourne zéro mobile éligible. Aucun nouvel avis de sécurité sur les deux fonctions lors du contrôle isolé. Un test d’intégration REST sur base locale jetable ajoute une variante du mobile, vérifie le regroupement puis l’exclusion après opposition sur l’alias, sans SMTP.


## Raccordement de la clé VSC existante — 29 octobre 2026

Compte dédié ouvert par l’utilisateur : profil contact@vendresoncommerce.com, campagne VSC historique et 912 contacts visibles. Clé API VENDRESONCOMMERCE active dans Brevo ; aucune création/rotation de clé. Le compte affiche zéro crédit SMS. Les informations de la session précédente contenant des campagnes NEOS ne sont pas utilisées pour configurer ce compte. Aucun contenu de campagne ni contact Brevo n’a été modifié.

Le secret `BREVO_VSC_API_KEY` était déjà enregistré dans Vercel, type Secret, preview de l’ancienne branche VSC. Les modifications par le connecteur ont retourné Project not found ; l’interface Vercel a permis de changer uniquement le rattachement de branche vers la branche actuelle. Le champ de valeur est resté intact ; aucun secret n’a été révélé ou transféré par la conversation. Le nom existant a été conservé et le diagnostic serveur adapté à ce nom. Pas de clé générale, pas de nouveau secret, pas de cible production et aucun drapeau d’envoi activé.

## Rapprochement Brevo VSC — 29 octobre 2026

Import administratif dédié, limité à la prévisualisation et à la base QA `mahgxumwucxehsooijag` (ou Supabase local jetable explicitement marqué en test). Lecture GET uniquement du compte dont l’adresse est `contact@vendresoncommerce.com`, clé serveur existante `BREVO_VSC_API_KEY`. Aucun changement du compte Brevo, aucune campagne ni livraison créée.

Aperçu intégral des contacts et listes avant écriture ; nouvelle lecture et empreinte de comparaison avant import. Les identités Brevo sont rapprochées par email/téléphone normalisés dans le seul tenant VSC. Les doublons transitifs contradictoires sont conservés comme conflits à examiner. Les coordonnées vides ne créent pas de fiches inutiles. Les numéros fixes restent des coordonnées, sans devenir des candidats SMS. Les identifiants email techniques `mailin-sms.com` sont exclus des adresses email réelles.

La migration `20261029143725_vsc_brevo_contact_import.sql` ajoute des liens de provenance avec statut individuel source et restrictions cumulatives. RPC invoker, droits service uniquement, administrateur actif obligatoire, verrou transactionnel par entreprise, lots atomiques de 100 groupes. Les refus Atlas existants ne sont jamais levés ; les exclusions email/SMS/globales persistent même après changement de statut Brevo. L’import annule uniquement les relances VSC encore en attente concernées. Une interruption peut laisser des lots terminés : relire l’aperçu et reprendre, sans relance automatique.

Validation avant import réel : 741 tests locaux ; typecheck ; script transactionnel `supabase/tests/vsc-brevo-contact-import.sql` réussi sur la base isolée puis QA, avec ROLLBACK complet des fixtures. RLS propriétaire contre propriétaire étranger, RPC inaccessible anon/authenticated, absence de SECURITY DEFINER, répétition sans doublon, opposition persistante, annulation et entreprise étrangère inchangée. Aucun nouvel avertissement de sécurité concernant les objets de cette migration ; avertissements historiques Atlas hors périmètre inchangés. La CI ajoute deux scénarios REST sur Supabase local jetable : imports concurrents identiques, puis refus Atlas et désinscription conservés.

L’historique des campagnes déjà envoyées dans Brevo n’est pas importé par cette opération. Il doit être rapproché avant tout lancement pour éviter de reproposer une première sollicitation déjà envoyée. Les permissions actuelles du fournisseur ne constituent pas une validation commerciale finale. Les envois et la production restent désactivés.

L’aperçu réel a révélé 349 identifiants `numero@landline.mailin-sms.com`, absents du champ SMS renvoyé par Brevo. Ils sont désormais exclus des emails, comme tous les sous-domaines `mailin-sms.com`. Pour les deux domaines techniques reconnus (`mailin-sms.com` et `landline.mailin-sms.com`), une partie numérique correspondant strictement à un téléphone valide permet de conserver ce numéro, avec provenance explicite ; une contradiction avec le champ SMS fait refuser la source. Les autres domaines ne servent jamais à inventer un téléphone. La migration complémentaire `20261029151249_vsc_brevo_identifier_guard.sql` bloque également les identifiants techniques dans le RPC. Script SQL enrichi validé avec ROLLBACK sur la base isolée puis QA. La CI #78 (`a627856`) a validé les 30 tests d’intégration, dont import concurrent et maintien des refus/exclusions par canal.

## Historique de l’email Brevo du 26 octobre

Le rapport réel de la campagne VSC #2, expéditeur/réponses contact@vendresoncommerce.com, liste #4, affiche 549 envois, 91 hard bounces, 45 soft bounces et 9 désinscriptions. Le total de livrés diffère entre vues du rapport (413 global, 416 dans la répartition par liste) : ne pas déduire une preuve individuelle de ces agrégats.

Rapprochement administratif par lots de 25 contacts email déjà liés, sans écriture fournisseur. GET du compte dédié puis campagne #2 vérifiée (nom VSC, expéditeur, statut envoyé, date du 26 octobre, seule liste #4). GET par identifiant de contact, email recoupé avec Atlas, événements de cette campagne uniquement. Le serveur ignore les IP et les liens suivis. Les observations sont conservées séparément dans les liens Brevo, jamais sous forme de livraisons OVH fictives. Statuts cumulatifs et absence de réactivation des oppositions ; un hard bounce ou blacklist email relu applique l’opposition email.

Une observation absente ne prouve pas un non-envoi. Toute fiche rapprochée de cet ancien parcours est exclue d’un nouveau premier email : sélection, sauvegarde atomique et précontrôle en base avant réservation/début/SMTP. Les relances ultérieures ne sont pas confondues avec un premier email ; leur futur parcours de reprise reste à préparer. Le rapprochement annule uniquement les emails initiaux encore draft/scheduled concernés, en plus des arrêts par opposition. Aucun nouveau contact, campagne, livraison ou message n’est créé.

Migration 20261029152442_vsc_brevo_historical_email.sql : fonctions invoker, search_path vide, droits serveur, acteur propriétaire/administrateur actif, verrou d’entreprise commun aux imports. Tests SQL transactionnels réussis sur isolée puis QA : preuve historique, isolation, refus d’un nouveau brouillon initial et absence d’écriture partielle. Test REST supplémentaire pour refus de réservation initiale et maintien de la réservation d’une vraie relance. La page permet de consulter le bilan et de traiter explicitement le lot suivant, sans reprise automatique d’un lot en erreur.

## Inspection historique des réponses OVH — lecture seule

La campagne Brevo historique ne fournit pas les Message-ID originaux dans les statistiques importées. Il serait incorrect de déclarer une réponse vérifiée sur le seul objet ou expéditeur. Un contrôle indépendant d’INBOX depuis le 26 octobre est donc ajouté : SEARCH date puis FETCH UID borné à 200, sans corps, sans modification des indicateurs de lecture ni du curseur habituel. Continuation propre à l’inspection ; changement UIDVALIDITY refusé et redémarrage explicite. Limite de recherche 5 000 UID, source Atlas paginée pour ne pas tronquer l’historique.

Les 549 expéditeurs dont l’ancien envoi est confirmé sont rapprochés par adresse exacte et date de réception postérieure à cet envoi. Les automatismes déclarés par en-têtes sont comptés séparément, les identités ambiguës signalées. Les messages sans en-tête de réponse restent consultables comme messages à examiner. L’objet compatible et la présence de références ne constituent pas une confirmation exacte. Aucune opposition, réponse en base, campagne, livraison ou relance n’est modifiée par ce diagnostic. Les autres dossiers ne sont pas inspectés ; le résultat décrit les messages présents dans INBOX au moment du contrôle et ne vaut pas surveillance continue.

Route POST même origine, rôle propriétaire/administrateur VSC, tenant imposé, JSON borné et paramètres de continuation validés avant accès à la boîte. Service limité au QA de prévisualisation. Erreurs masquées et aucun réessai automatique. Interface présente le périmètre, les lots restants, les métadonnées utiles et les limites, sans afficher de corps ou d’identifiants de suivi de liens.

Recette de l’inspection historique en session propriétaire : le 29 octobre à 15:50 UTC, 17 messages examinés dans INBOX, 549 expéditeurs historiques connus, zéro message à examiner, zéro automatisme de ces expéditeurs, zéro métadonnée incomplète et zéro ambiguïté. Lecture terminée pour le périmètre annoncé. Curseur habituel avant/après strictement identique (version 5, dernière mise à jour du 28 octobre) ; aucune annulation ou envoi effectué.

## Préparation de la relance OVH historique

La reprise prépare seulement l’email J+20 « consideration » à partir de chaque date d’envoi historique prouvée. Pour le 26 octobre, la date proposée est le 15 novembre 2026 à 9 h 30 Europe/Paris (08:30 UTC). Aucun J0 ni J+40 : le 5 décembre dépasse la fin de promotion. Contenu de la relance conservé sur une campagne draft, sans approuver ni activer. Les réponses/oppositions doivent être recontrôlées avant toute future activation ; le diagnostic historique ne remplace pas la surveillance continue.

Sélection en base : historique prouvé correspondant à l’adresse actuelle, autorisation de contact, absence d’opposition et de réponse connue, échéance future dans la promotion. Aperçu avec empreinte puis relecture avant sauvegarde. Lots atomiques de 100 contacts et unicité par tenant/personne/source historique/étape. Une interruption peut laisser des lots enregistrés ; l’aperçu suivant ne propose que les contacts restants. Un réessai identique conserve le même brouillon, une copie/date ou identité différente est refusée. L’interface ne transmet aucun choix de tenant, de destinataire ou de date au serveur. Limite explicite : moins de 1 000 contacts éligibles par opération.

Migration 20261029155132_vsc_historical_followup_draft.sql testée sur isolée puis QA. Scénario SQL transactionnel : date Paris exacte, opposition et tenant étrangers exclus, date détournée refusée, un seul email de relance draft, aucun email initial, aucune activation, idempotence, seconde création refusée et RPC non accessibles anon/authenticated. Les cas positifs datés sont fermés lorsque l’échéance est passée ; le refus des échéances passées reste contrôlé.

## Synchronisation manuelle des blocages SMS Brevo VSC

Lecture GET complète et bornée des contacts du compte dédié, après vérification de son identité, avec la seule clé BREVO_VSC_API_KEY. Les identifiants et la pagination sont contrôlés avant toute écriture ; statut SMS absent/inconnu signalé séparément et aucune réautorisation implicite. Aucun endpoint fournisseur de modification ou d’envoi n’est appelé.

La RPC vsc_apply_brevo_sms_stops conserve les blocages SMS confirmés sur les seuls liens VSC existants, puis applique les oppositions SMS et annule les livraisons SMS draft/scheduled des personnes liées et des variantes du même mobile français dans VSC. Les identités source non rapprochées ne créent pas de personne. Les blocages historiques restent applicables même lorsque la source n’en signale plus : une reprise réannule aussi tout nouveau SMS en attente. Aucun refus global, autorisation de contact ou opposition email n’est modifié ; emails et NEOS IMMO restent hors périmètre.

Migration 20261029161248_vsc_brevo_sms_stops.sql : RPC invoker/search_path vide, service uniquement, administrateur actif de l’entreprise obligatoire et verrou transactionnel partagé avec les imports. Tests transactionnels validés sur isolée puis QA : STOP et alias, annulation SMS sans annulation email, entreprise étrangère inchangée, identifiant non rapproché, reprise sans réactivation et refus d’un administrateur étranger. La route impose tenant/acteur de session et origine, ne prend aucune liste d’identifiants du client. Bouton de synchronisation explicite dans la préparation VSC.

Cette étape n’installe ni webhook ni surveillance continue et n’active aucun SMS. La lecture courante ne garantit pas l’absence d’un STOP ultérieur : le futur transport doit encore intégrer un contrôle frais, les événements STOP/réponses et le pilote avant toute activation.

Recette navigateur du brouillon Brevo #5 « sms vsc octobre » : texte ancien « -50 % sur tous nos forfaits » remplacé par la copie VSC explicite 79 EUR HT au lieu de 159 EUR HT, annonce jusqu’à la vente, fin au 30 novembre 2026, STOP au [STOP_CODE]. Relecture après sauvegarde : copie correcte, état Brouillon, 2 SMS estimés, zéro destinataire, boutons de test/envoi désactivés. Aucun envoi, expéditeur ou destinataire créé par cette modification.

## Expéditeur et sélection SMS conservée — 29 octobre 2026

L’ID d’expéditeur existant **VDC** est vérifié dans Brevo pour la France (promotionnel et transactionnel). Il a été sélectionné puis sauvegardé sur les six brouillons SMS #5 à #10. Relecture de chaque bouton « Expéditeur VDC » après sauvegarde ; brouillons sans destinataire ni programmation. Aucun nouvel ID, crédit ou SMS de test acheté/envoyé.

La préparation Atlas ajoute une sélection immuable de mobiles, distincte des campagnes et livraisons. Le serveur relit tous les candidats (plafond explicite 999, dépassement refusé), normalise les mobiles FR, dédoublonne, exclut les oppositions SMS/globales et réponses connues sur tous les alias. Les oppositions email restent propres au canal email. Aperçu QA constaté : **143 mobiles, 113 avec email utilisable, 30 pour le parcours mobile seul**. Aucun calendrier ni nouvel email initial n’est déduit de ce comptage.

La sauvegarde impose l’entreprise VSC configurée, un administrateur actif, l’origine de la requête et une empreinte de l’aperçu frais. Les coordonnées proviennent exclusivement du serveur ; les sélections modifiées sont refusées, les reprises identiques sont idempotentes. Table RLS en lecture pour les seuls administrateurs de leur entreprise, pas de mise à jour/suppression applicative, aucune écriture fournisseur ni livraison créée. Toute utilisation future nécessite une nouvelle vérification des oppositions, réponses, coordonnées et dates.

Migration 20261029164220_vsc_sms_audience_drafts.sql et tests SQL transactionnels exécutés avec succès sur la base isolée puis QA : dédoublonnage, séparation des canaux, reprise, refus d’écrasement et de sélection obsolète, isolation RLS et absence de nouvelle campagne/livraison. Aucun nouvel avis de sécurité concernant ces objets. Tests applicatifs supplémentaires : refus hors QA/tenant, aperçu sans coordonnées, empreinte obsolète, identité déterministe, pagination tronquée, origine/session et corps invalides. Test REST local jetable ajouté à la CI pour la sauvegarde concurrente puis STOP ; résultat à vérifier sur le nouveau commit avant de déclarer la recette complète.

Contrôle complémentaire de performance : migration 20261029165433_vsc_sms_audience_indexes.sql (index de la clé créée par et auth.uid évalué une fois dans la politique). Test SQL complet repassé sur isolée et QA. Les avertissements de clé étrangère non indexée et d’auth RLS réévaluée pour cette table ont disparu ; seul l’avis informatif d’index encore inutilisé reste attendu sur la nouvelle table.

Recette navigateur et SQL QA : synchronisation STOP le 29/10 à 16:55:16.136Z, 912 contacts source, 0 blocage SMS, 0 statut inconnu, 0 annulation. Sélection enregistrée à 16:56:05.221231Z, ID 37330976-7106-506f-ab95-de547f290894 : 143 mobiles, 113 avec email utilisable et 30 mobiles seuls. Une seule version, retrouvée après rechargement. Toujours 5 campagnes non approuvées et 449 livraisons email draft, aucune livraison SMS créée. NEOS inchangé : 63 235 personnes, 63 166 autorisées, 3 do_not_contact, dernier updated_at 2026-10-29T11:21:18.5703Z. 792 tests locaux et TypeScript passent sur ce développement.

## Entrée de synchronisation automatique STOP SMS préparée

`GET /api/cron/vsc-sms-stops` prépare le polling des blocages Brevo VSC sans installer de calendrier. Désactivé par défaut, il exige `VSC_SMS_STOPS_CRON_ENABLED=true`, un `CRON_SECRET` d’au moins 32 caractères et son Bearer exact (comparaison de condensats en temps constant). `VSC_OVH_TENANT_ID` et `VSC_SMS_STOPS_ACTOR_ID` proviennent exclusivement de la configuration serveur, jamais des paramètres URL. La RPC existante revalide l’appartenance active owner/admin à chaque invocation ; un acteur révoqué ne peut plus appliquer de blocage.

Un appel lance une seule synchronisation complète et bornée du compte dédié, conserve les exclusions SMS existantes et annule seulement les SMS en attente concernés. Le service reste réservé à la preview QA ou au Supabase local jetable. Aucun repli vers le compte NEOS, écriture fournisseur, envoi, nouvelle livraison ou réautorisation. Erreurs masquées, réponse non mise en cache et aucune reprise en boucle après échec.

Tests : drapeau exact et indépendant, secret absent/court/incorrect/surdimensionné, tenant et acteur invalides, identités URL ignorées, appel unique et erreur sans fuite ni reprise. Aucun flag, secret, acteur distant ou calendrier n’est installé par cette modification. Le polling devra être recetté puis planifié sur l’hébergement de test retenu avant de parler de surveillance continue ; il ne remplace pas le traitement des réponses historiques OVH encore à terminer.
