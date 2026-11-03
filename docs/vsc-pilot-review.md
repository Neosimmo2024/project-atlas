# Pilote VendreSonCommerce — dossier de décision du 3 novembre 2026

## Résultat proposé

Recetter d'abord un email OVH vers une boîte de test désignée par Renato et un SMS vers son mobile de test, séparément et sans destinataire commercial. L'adresse d'expédition reste `contact@vendresoncommerce.com`, le SMS utilise exclusivement le compte Brevo VSC et l'expéditeur VDC. Aucun crédit ne sera acheté sans accord. Une acceptation API ne sera pas présentée comme une livraison.

Cette proposition n'autorise aucun envoi. Les coordonnées de test doivent être confirmées avant leur utilisation ; aucune adresse ou aucun numéro de prospect n'est choisi automatiquement. Les deux PR restent en brouillon et la production reste inchangée.

## Constat réel en QA

- Collecte des réponses OVH et STOP Brevo active toutes les dix minutes. Passages automatiques des 3 novembre à 11 h 40 et 11 h 50 Europe/Paris complets : 912 contacts Brevo, zéro statut SMS inconnu ou source non rapprochée. Les mises en pause et oppositions déjà conservées ne sont jamais levées.
- Deux groupes de 449 emails en cinq lots chacun, soit 898 brouillons sans tentative, approbation ou activation. Dates stockées : **15 et 30 novembre à 9 h 30 Europe/Paris**. Ces dates dans Atlas ne constituent pas une programmation d'envoi chez OVH.
- 113 contacts email + mobile avec un rappel J+5 échu au 31 octobre. Aucun rattrapage programmé.
- 30 mobiles seuls : version de relecture sauvegardée avec départ au 2 novembre, désormais passé. Ses dates ne sont pas déplacées automatiquement. Son J+60 au 1er janvier est signalé comme incompatible avec le contrôle du transport.
- Zéro livraison SMS créée. Les cinq tâches préexistantes et les données NEOS IMMO ne sont pas modifiées.

## Textes à relire

### Relance email J+20, 15 novembre

Objet : **Votre projet de vente de commerce : où en êtes-vous ?**

Bonjour,

Je reviens vers vous au sujet de votre éventuel projet de vente de commerce.

L’offre VendreSonCommerce est de 79 € HT au lieu de 159 € HT, avec une annonce publiée jusqu’à la vente. Cette promotion est valable jusqu’au 30 novembre 2026.

Votre projet est-il toujours d’actualité ? Vous pouvez nous répondre directement : nous pourrons vous expliquer comment publier votre annonce.

Bien cordialement,
L’équipe VendreSonCommerce
contact@vendresoncommerce.com

### Dernier email, 30 novembre

Objet : **Dernier jour : votre annonce jusqu’à la vente à 79 € HT**

Bonjour,

Aujourd’hui, 30 novembre 2026, est le dernier jour pour profiter de notre offre à 79 € HT au lieu de 159 € HT.

Avec VendreSonCommerce, votre annonce reste publiée jusqu’à la vente.

Vous avez un projet de cession de commerce ? Répondez à cet email pour échanger sur la publication de votre annonce.

Bien cordialement,
L’équipe VendreSonCommerce
contact@vendresoncommerce.com

Le lien personnel de désinscription est ajouté par le transport, pas collé manuellement dans les brouillons. Aucun nouvel email initial n'est proposé aux destinataires de l'envoi historique confirmé.

### Proposition pour les 113 rappels échus

VendreSonCommerce : suite a notre email, votre projet de vente de commerce est-il toujours d'actualite ? 79 EUR HT au lieu de 159 EUR HT, annonce jusqu'a la vente. Offre jusqu'au 30 novembre 2026. vendresoncommerce.com STOP au [STOP_CODE]

Proposition uniquement : deux segments estimés, remplacement STOP et décompte final à vérifier avec Brevo. Renato doit décider de conserver ou abandonner ces rappels et, s'il souhaite un rattrapage, de sa date. Cette proposition ne fait pas partie du calendrier sauvegardé des mobiles seuls. Après la promotion, aucune copie à 79 € HT ne pourra être réutilisée.

## Relecture dans Atlas

La page `/admin/vsc-campaigns` contient « Actualiser le bilan du pilote ». Cette action est en lecture seule, réservée au propriétaire/administrateur VSC et à l'environnement QA. Elle regroupe les dates, effectifs, lots, état de collecte et décisions restantes ; elle ne renvoie aucune identité ou coordonnée de destinataire. Les données tronquées, incohérentes ou indisponibles empêchent d'afficher un bilan partiel trompeur.

La simulation mobile seul part de la date courante affichée. Elle est distincte de la version sauvegardée : aucun changement de départ, texte ou sélection n'est persisté. Les étapes après le 30 novembre utilisent les textes hors promotion ; tout jour incompatible reste signalé, sans décalage automatique. Un bilan complet ne vaut ni éligibilité définitive ni autorisation d'envoi.

## Recette à réaliser après confirmation des coordonnées de test

1. Préparer un parcours technique limité aux destinataires de test confirmés, sans activer les campagnes commerciales.
2. Email : vérifier l'expéditeur OVH et la réception réelle, répondre au message, vérifier la collecte automatique et l'arrêt de la relance de test ; vérifier aussi la désinscription sur une identité de test distincte.
3. SMS : vérifier les crédits sans achat, un envoi unique autorisé et son reçu ; confirmer la réception sur le mobile, puis l'opposition du test et son traitement. Un timeout ou reçu ambigu impose une vérification sans second envoi automatique.
4. Relire ensemble le résultat et les destinataires commerciaux avant toute validation du lancement. Aucun crédit ou pilote externe n'est implicitement autorisé par la réussite des tests automatisés.

## Limites techniques encore ouvertes

Le transport manuel email est actuellement réservé à la production configurée ; le collecteur et les STOP Brevo restent bornés à la QA. La réussite de la recette QA ne rend donc pas le parcours de production prêt. Un dispositif de test à destinataires strictement limités doit être préparé avant le prochain envoi réel, puis la configuration et les protections de production doivent être recettées séparément après accord de mise en production.

L'adaptateur SMS reste sans route/interface/calendrier d'envoi. La collecte des blocages Brevo ne prouve pas la collecte de toutes les réponses SMS libres : ce point doit être résolu avant un parcours commercial SMS qui promet l'arrêt sur réponse. L'approbation et la matérialisation des livraisons SMS restent également à terminer. Aucun compteur de brouillons n'est présenté comme un nombre de messages livrables ou livrés.
