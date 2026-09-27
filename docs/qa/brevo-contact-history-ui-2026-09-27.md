# Suivi des contacts Brevo — 27 septembre 2026

Ajoute /admin/brevo-contacts et le lien administrateur Suivi Brevo. Lecture seule via client authentifié et RLS, filtre du tenant issu de la session, pagination stable de 20 opérations et filtre de statut fermé. Aucun appel Brevo, aucune migration distante, aucun envoi ni activation.

La table absente (42P01/PGRST205) est distincte d’un journal vide et des erreurs de lecture. Les opérations incertaines restent à vérifier sans relance. Les résultats sont historiques, pas une attestation de l’état courant du fournisseur. Heures Europe/Paris.

Vérifications locales : 11 tests d’autorisation, isolation de tenant, pagination, filtre et erreurs ; TypeScript et ESLint réussis. Vérification QA et CI après publication.

Sans n8n. Le journal reste à installer sur QA avant l’affichage d’opérations réelles. Les prérequis d’activation et le ticket Brevo restent ouverts.
