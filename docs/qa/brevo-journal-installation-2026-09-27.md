# Installation du journal sur QA — 27 septembre 2026

Le journal est désormais installé sur Atlas QA Beta 1 (`mahgxumwucxehsooijag`). Cette note remplace les mentions antérieures « journal à installer ».

Migration distante `20260927202503_brevo_contact_sync_journal`, SQL exact du fichier dépôt `20260924195950_brevo_contact_sync_journal.sql` (blob `100b621409eae60b0a916edd1d27c25a8c24f198`). Le timestamp distant diffère car la migration est appliquée par le connecteur ; ne pas rejouer le fichier sur QA.

Contrôles : RLS active, trois politiques, lecture anonyme refusée, lecture authentifiée soumise à RLS, suppression authentifiée refusée. 0 opérations, 9 personnes et 10 tâches avant/après ; cron job 2 toujours arrêté. Aucun appel d’écriture Brevo ni email/SMS ; aucune modification de production.

Page QA propriétaire : historique vide et filtrage vérifiés. Un défaut visuel du sélecteur après navigation Réinitialiser a été découvert ; la clé du select suit maintenant le filtre serveur pour réinitialiser sa sélection. TypeScript et lint contrôlés ; recette finale sur la version déployée.

L’analyse sécurité ne signale aucun objet du nouveau journal. Elle remonte 18 fonctions SECURITY DEFINER préexistantes accessibles aux utilisateurs authentifiés, non modifiées ici. Référence : https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

La synchronisation reste inactive. Résolution auditée des résultats incertains et contrôle des automatisations Brevo à terminer avant toute activation. Sans n8n.
