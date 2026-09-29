# Préparation du test SMS personnel — 29 septembre 2026

L’écran QA « Suivi des contacts Brevo », déjà réservé aux propriétaires et administrateurs, propose un aperçu SMS local au navigateur. Le formulaire ne possède ni Server Action, ni route d’envoi, ni appel réseau, ni stockage persistant. Il ne modifie pas la fixture Brevo 334 sans téléphone.

Le message technique est fixe et composé de 104 caractères GSM simples ; un test vérifie sa limite de 160 caractères. La préparation normalise les formats 06/07 et +336/+337, rejette les listes, les formats ambigus et les numéros hors périmètre. La syntaxe ne prouve ni la propriété ni la réception. Toute modification du champ efface le résultat précédent.

Ce premier lot concernait uniquement l’aperçu. Le raccordement d’envoi unique est décrit dans sms-personal-send-2026-09-29.md et reste désactivé par défaut. Avant celui-ci : vérifier l’activation SMS du compte, l’expéditeur, les crédits, le numéro personnel autorisé, puis prévoir un journal idempotent et un envoi unique avec résultat explicite, sans reprise automatique en cas d’issue incertaine. Aucun candidat réel ni automatisme de relance ne fait partie de ce test.

Validation locale : 901 tests / 116 fichiers, TypeScript, lint et diff-check. Tests dédiés de normalisation, refus des destinataires ambigus, absence d’état envoyé et longueur du texte fixe.

Source de la limite : https://help.brevo.com/hc/fr/articles/208718649-Est-on-limit%C3%A9-par-le-nombre-de-caract%C3%A8res-dans-un-SMS (consultée le 29 septembre 2026). Le calcul de crédits et les messages Unicode ne sont pas proposés dans cet aperçu.
