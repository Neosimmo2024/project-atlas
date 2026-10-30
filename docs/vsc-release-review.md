# Revue avant lancement — VendreSonCommerce

État constaté le 29 octobre 2026, PR #88, dépendante de la PR #87. Aucune fusion ni mise en production autorisée. Les campagnes NEOS IMMO restent hors périmètre.

## Fonctionnel et vérifié

- Connexion SMTP OVH et collecte IMAP avec l’identité contact@vendresoncommerce.com.
- Aller-retour réel et reconnaissance d’une réponse technique avec In-Reply-To/References. Le worker a enregistré la réponse et annulé la relance fictive.
- Traitement manuel réel depuis la page administrateur, sans envoi. Reprise par lots et point de reprise IMAP persistant.
- Désinscription email persistante via lien signé : lecture GET sans écriture, confirmation POST contrôlée, arrêt des relances.
- Isolation par entreprise, droits RPC serveur et refus d’accès aux membres suspendus testés sur base isolée et en CI.
- Prévisualisation Vercel disponible. Les secrets et migrations VSC de QA sont préparés ; aucune configuration de production changée.

## Implémenté dans le code, sans parcours commercial actif

- Interface `/admin/vsc-campaigns` : sélection explicite de contacts email VSC autorisés, modification des objets/textes proposés, aperçu des dates et messages, sauvegarde atomique et idempotente de brouillons non approuvés, relecture des textes conservés dans les 20 dernières campagnes. Un espace de propositions SMS et de simulation des dates est disponible, avec sauvegarde de versions immuables, sans sélection de destinataires ni transport.
- Transport email OVH contrôlé avant envoi : identité, destinataire, autorisation actuelle de contact, oppositions, réponses connues, lien de désinscription et fin de promotion. Ce transport n’est raccordé à aucun endpoint d’envoi.
- Réservation atomique des livraisons email, passage unique au début de tentative, libération uniquement avant tentative et résultat incertain bloqué. Ces primitives sont réservées au serveur et raccordées à un adaptateur SMTP désactivé par défaut, sans endpoint d’envoi ni scheduler. Les politiques d’approbation et d’activation restent sans interface de lancement.
- Règles SMS Brevo et propositions éditables préparées : aperçu email+mobile J+5 ou mobile seul J0/J+15/J+30/J+45, limité au 30 novembre. Estimation GSM-7/Unicode et segments, Repère Brevo officiel [STOP_CODE] dans les nouveaux modèles ; anciens textes conservés sans réécriture. Les textes, la date et le parcours peuvent être conservés par versions immuables après aperçu, puis relus après rechargement. Aucun transport SMS VSC ni test réel validé dans cette recette.

## Travaux nécessaires avant une campagne réelle

1. Faire valider les textes, les destinataires et la cadence d’un pilote concret. Les propositions éditables et leur aperçu sont disponibles, sans approbation ni envoi.
2. Valider l’adaptateur réservé sur un pilote technique explicitement autorisé avant toute activation commerciale et finaliser la résolution humaine auditée des cas incertains. Une liste de lecture et une procédure de vérification sont disponibles dans la page des campagnes ; aucune modification de résultat ni relance n’y est possible. Le parcours intégré est testé sur une base jetable avec SMTP simulé ; il ne constitue pas une recette réelle d’envoi commercial. Aucun rapprochement ou renvoi automatique des cas incertains n’est activé.
3. Recetter puis installer une planification du worker OVH. Le point d’entrée serveur `/api/cron/vsc-replies` est préparé mais désactivé ; aucun calendrier n’est installé. La collecte des réponses ne déclenche aucun envoi.
4. Terminer séparément le parcours SMS VSC, ses oppositions et sa vérification sur un numéro de test autorisé.
5. Présenter la campagne et les résultats complets avant toute approbation de lancement.

## Offre et limites de calendrier

79 € HT au lieu de 159 € HT, annonce jusqu’à la vente, promotion jusqu’au 30 novembre 2026 inclus, heure de Paris. Les étapes prévues après cette date sont exclues. Le transport email refuse également les messages promotionnels retardés dès le 1er décembre à 00:00 à Paris.

## Limites de la recette

Les tests techniques réels ont visé uniquement notre propre boîte contact. Aucun prospect externe ni numéro de téléphone n’a reçu de message. Les données fictives de QA ont été nettoyées ; le point de reprise IMAP est conservé. La réussite de la CI et du diagnostic OVH ne vaut ni approbation d’une campagne ni validation de l’ensemble du parcours commercial.


## Vérification du compte SMS — 29 octobre 2026

Le navigateur affiche le profil contact@vendresoncommerce.com et le nom « vendresoncomemrce », mais aussi des campagnes NEOS IMMO dans les listes email et SMS après rechargement. Cette observation ne prouve pas la séparation des données Brevo. Aucune de ces campagnes n’a été ouverte en édition, modifiée, suspendue ou envoyée. Le raccordement SMS VSC doit donc encore confirmer la séparation des listes et des retours.

Un diagnostic administrateur en lecture seule utilise exclusivement `VSC_BREVO_API_KEY` et GET /v3/account. Aucun repli vers `BREVO_API_KEY` de recrutement. Le contrôle compare l’email du compte à contact@vendresoncommerce.com, sans exposer l’identité d’un autre compte, les crédits ou les détails du fournisseur. Un résultat positif vérifie seulement l’identité du compte, pas son isolation. Les métadonnées Vercel vérifiées sans déchiffrement ne contiennent aucune clé VSC dédiée ; aucune clé n’a été créée ou copiée.

Brevo documente le remplacement automatique de [STOP_CODE] par un code propre au canal lors de l’envoi. Les nouveaux modèles utilisent ce repère au lieu de [numero STOP VSC]. Les versions enregistrées restent inchangées. Le traitement des désinscriptions dans Atlas et la recette réelle restent à finaliser ; aucun envoi SMS n’est raccordé.


## Préparation des contacts mobiles — 29 octobre 2026

Une liste de consultation des mobiles VSC est disponible dans la page des campagnes, réservée aux propriétaires/administrateurs VSC. Elle normalise les 06/07 français saisis sous forme nationale, +33 ou 0033, regroupe les variantes d’un numéro et exclut les mobiles portant une opposition globale/SMS ou une réponse sur une fiche VSC liée. Aucun contact NEOS n’est pris en compte. Une opposition email seule retire la disponibilité email sans exclure le SMS.

Cette liste ne sauvegarde aucune sélection et ne transmet aucun destinataire à Brevo. Elle reste une préparation, sans contrôle des futures réponses SMS du fournisseur, sans création de livraison et sans envoi. Les contrôles devront être refaits lors de la future sauvegarde des destinataires et avant toute tentative. Le QA VSC ne contient actuellement aucun mobile éligible.


## Compte Brevo dédié retrouvé — 29 octobre 2026

L’utilisateur a ouvert son compte VSC dédié dans le navigateur. Le profil contact@vendresoncommerce.com affiche 912 contacts et la campagne VSC historique « Promo -50% — Email 1 » du 26 octobre. Cette observation remplace l’ambiguïté de la session précédente ; aucun nouveau compte n’est nécessaire. Une clé API nommée VENDRESONCOMMERCE est déjà active. Les crédits SMS affichés sont à zéro ; aucun achat ni envoi n’a été lancé.

Le secret Vercel existant porte le nom `BREVO_VSC_API_KEY` et était limité à l’ancienne branche `feature/tenant-switcher-vendresoncommerce`. Il a été rattaché à `feature/vsc-campaign-engine-foundation`, en preview uniquement, sans lecture, rotation ou remplacement de sa valeur. Le diagnostic utilise désormais ce nom existant, sans repli vers la clé générale de recrutement. Aucun paramètre de production ni secret NEOS/LFI n’a été changé.

## Contacts Brevo VSC — import de préparation

L’interface administrateur VSC possède un rapprochement avec aperçu puis import des contacts/exclusions existants du compte Brevo dédié. L’opération est limitée à la base QA de la prévisualisation ; aucune écriture sur Brevo ou NEOS IMMO, aucune nouvelle campagne/livraison et aucun envoi. L’historique des anciennes campagnes Brevo reste à rapprocher avant un futur lancement. Les conflits d’identité sont conservés pour vérification et ne déclenchent aucune fusion automatique.

Entrée de polling STOP SMS préparée : `/api/cron/vsc-sms-stops`, indépendante et désactivée par défaut. Nécessite le flag `VSC_SMS_STOPS_CRON_ENABLED=true`, `CRON_SECRET` et un `VSC_SMS_STOPS_ACTOR_ID` owner/admin actif du tenant VSC. Aucun calendrier ni variable distante installé ; QA uniquement. À recetter avec un acteur révoqué et le contrôle du compte dédié avant planification. Aucun envoi autorisé par ce point d’entrée.

Messages historiques OVH : worker de mise en pause séparé et action administrateur disponibles. Un message humain d’un destinataire historique unique arrête les relances VSC via les gardes existantes, sans prétendre à une attribution exacte ni modifier Brevo. Journal et checkpoint atomiques, identités ambiguës/incomplètes bloquées pour examen. Entrée machine désactivée `/api/cron/vsc-historical-inbound` ; QA seulement. Recette propriétaire de la preview et installation du calendrier sur l’hébergement de test encore nécessaires. Aucun envoi autorisé.

Recette historique propriétaire du 30 octobre réussie : 24 messages puis reprise vide ; checkpoint exact inchangé. Préparation du dernier email au 30 novembre 2026 à 9 h 30 Paris ajoutée, distincte du J+20 et de l’ancien J+40 hors promotion. Sauvegarde et relecture des brouillons réels à consigner après publication de la preview. Aucun calendrier ni envoi activé.
