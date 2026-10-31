# Diagnostic OVH VendreSonCommerce

Page /admin/ovh-connection, indépendante du diagnostic LFI IONOS.
Compte MX Plan confirmé actif dans OVH le 27 octobre 2026 ; compte contact non bloqué pour spam.
SMTP ssl0.ovh.net:465 TLS, identité contact@vendresoncommerce.com imposée côté serveur.
VSC_OVH_TENANT_ID doit désigner le tenant Atlas autorisé (rôles owner/admin seulement).
VSC_OVH_SMTP_PASSWORD doit être renseigné par Renato dans les secrets Vercel, jamais Git ou chat.
La vérification ne fait aucun envoi. Elle ne valide ni réception, ni IMAP, ni campagnes.
IMAP prévu : ssl0.ovh.net:993 TLS, non implémenté ici.
Référence : https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/mx-plan/email-generalities
Ne pas utiliser cette identité comme routage global : VSC dispose du tenant f716f14d-7fc8-4e33-a49a-18c6a2367816. La résolution du contexte filtre explicitement ce tenant et vérifie l’appartenance active de l’utilisateur connecté.
