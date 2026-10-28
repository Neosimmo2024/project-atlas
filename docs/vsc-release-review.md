# Revue avant lancement — VendreSonCommerce

État constaté le 28 octobre 2026, PR #88, dépendante de la PR #87. Aucune fusion ni mise en production autorisée. Les campagnes NEOS IMMO restent hors périmètre.

## Fonctionnel et vérifié

- Connexion SMTP OVH et collecte IMAP avec l’identité contact@vendresoncommerce.com.
- Aller-retour réel et reconnaissance d’une réponse technique avec In-Reply-To/References. Le worker a enregistré la réponse et annulé la relance fictive.
- Traitement manuel réel depuis la page administrateur, sans envoi. Reprise par lots et point de reprise IMAP persistant.
- Désinscription email persistante via lien signé : lecture GET sans écriture, confirmation POST contrôlée, arrêt des relances.
- Isolation par entreprise, droits RPC serveur et refus d’accès aux membres suspendus testés sur base isolée et en CI.
- Prévisualisation Vercel disponible. Les secrets et migrations VSC de QA sont préparés ; aucune configuration de production changée.

## Implémenté dans le code, sans parcours commercial actif

- Construction d’un plan de relances email/SMS et sauvegarde des livraisons au statut brouillon. Ces fonctions sont testées mais ne sont pas raccordées à une interface de création de campagne.
- Transport email OVH contrôlé avant envoi : identité, destinataire, autorisation actuelle de contact, oppositions, réponses connues, lien de désinscription et fin de promotion. Ce transport n’est raccordé à aucun endpoint d’envoi.
- Politiques d’approbation, activation et réservation des livraisons. Elles ne constituent pas un moteur de distribution atomique déployé.
- Règles SMS Brevo préparées. Aucun transport SMS VSC ni test réel de SMS validé dans cette recette.

## Travaux nécessaires avant une campagne réelle

1. Raccorder la sélection de contacts VSC et la création des brouillons à une interface administrateur, avec aperçu des messages et des dates avant sauvegarde.
2. Préparer les textes commerciaux et les destinataires d’un pilote concret pour validation. Aucun contenu commercial de campagne n’est approuvé par la présente recette technique.
3. Implémenter et vérifier la réservation atomique et la reprise des livraisons ; définir le traitement des résultats fournisseur ambigus afin d’éviter les renvois.
4. Préparer une planification du worker OVH ; actuellement seul le traitement manuel est disponible. La collecte des réponses ne déclenche aucun envoi.
5. Terminer séparément le parcours SMS VSC, ses oppositions et sa vérification sur un numéro de test autorisé.
6. Présenter la campagne, les destinataires, la cadence et les résultats complets avant toute approbation de lancement.

## Offre et limites de calendrier

79 € HT au lieu de 159 € HT, annonce jusqu’à la vente, promotion jusqu’au 30 novembre 2026 inclus, heure de Paris. Les étapes prévues après cette date sont exclues. Le transport email refuse également les messages promotionnels retardés dès le 1er décembre à 00:00 à Paris.

## Limites de la recette

Les tests techniques réels ont visé uniquement notre propre boîte contact. Aucun prospect externe ni numéro de téléphone n’a reçu de message. Les données fictives de QA ont été nettoyées ; le point de reprise IMAP est conservé. La réussite de la CI et du diagnostic OVH ne vaut ni approbation d’une campagne ni validation de l’ensemble du parcours commercial.
