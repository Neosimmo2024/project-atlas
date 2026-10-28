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

- Interface `/admin/vsc-campaigns` : sélection explicite de contacts email VSC autorisés, modification des objets/textes proposés, aperçu des dates et messages, sauvegarde atomique et idempotente de brouillons non approuvés, relecture des textes conservés dans les 20 dernières campagnes. Les plans SMS restent dans les fonctions de politique, sans interface ni transport SMS.
- Transport email OVH contrôlé avant envoi : identité, destinataire, autorisation actuelle de contact, oppositions, réponses connues, lien de désinscription et fin de promotion. Ce transport n’est raccordé à aucun endpoint d’envoi.
- Réservation atomique des livraisons email, passage unique au début de tentative, libération uniquement avant tentative et résultat incertain bloqué. Ces primitives sont réservées au serveur et ne sont raccordées ni au transport SMTP ni à un endpoint d’envoi ou scheduler. Les politiques d’approbation et d’activation restent sans interface de lancement.
- Règles SMS Brevo préparées. Aucun transport SMS VSC ni test réel de SMS validé dans cette recette.

## Travaux nécessaires avant une campagne réelle

1. Faire valider les textes, les destinataires et la cadence d’un pilote concret. Les propositions éditables et leur aperçu sont disponibles, sans approbation ni envoi.
2. Raccorder, après validation, les primitives de réservation au transport OVH en imposant l’identifiant de message réservé ; classifier les résultats SMTP avec preuve et préparer la procédure humaine de traitement des cas incertains. Aucun rapprochement ou renvoi automatique de ces cas n’est activé.
3. Préparer une planification du worker OVH ; actuellement seul le traitement manuel est disponible. La collecte des réponses ne déclenche aucun envoi.
4. Terminer séparément le parcours SMS VSC, ses oppositions et sa vérification sur un numéro de test autorisé.
5. Présenter la campagne et les résultats complets avant toute approbation de lancement.

## Offre et limites de calendrier

79 € HT au lieu de 159 € HT, annonce jusqu’à la vente, promotion jusqu’au 30 novembre 2026 inclus, heure de Paris. Les étapes prévues après cette date sont exclues. Le transport email refuse également les messages promotionnels retardés dès le 1er décembre à 00:00 à Paris.

## Limites de la recette

Les tests techniques réels ont visé uniquement notre propre boîte contact. Aucun prospect externe ni numéro de téléphone n’a reçu de message. Les données fictives de QA ont été nettoyées ; le point de reprise IMAP est conservé. La réussite de la CI et du diagnostic OVH ne vaut ni approbation d’une campagne ni validation de l’ensemble du parcours commercial.
