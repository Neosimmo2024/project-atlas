# Rapprochement des contacts Brevo — préparation locale

Décision de Renato du 27 septembre 2026 : aucun compte ni dépendance n8n. Les automatismes doivent utiliser les composants AVENOR existants. Les anciennes mentions n8n décrivent une orientation abandonnée.

Le module services/brevo-contact-reconciliation.ts ajoute une évaluation en lecture seule des tentatives pending/write_outcome_unknown. Désactivé par défaut, il vérifie l'identité et le tenant, lit la source autorisée, demande une observation fournisseur par identifiant externe exact puis relit les droits et la tentative. Il ne fournit aucune méthode d'écriture, de déverrouillage ou de relance.

Un contact absent n'est jamais considéré comme preuve d'échec d'une écriture précédente. Une correspondance observée nécessite toujours un examen ; ce n'est pas une preuve d'exécution de la tentative. Une opposition non reflétée chez Brevo est signalée sans mutation. Les résultats ne contiennent ni adresse ni erreur brute.

Validation locale : 14 nouveaux tests ; 122 tests contacts réussis sur 6 fichiers avec la configuration Vitest de apps/web. Contrôle TypeScript ciblé réussi. Le premier lancement à la racine ne résolvait pas l'alias @ ; relance depuis apps/web réussie.

Limites : lecteurs injectés et simulés ; aucun adaptateur réseau de rapprochement ni route ni interface ajoutés ; aucune migration distante. Les lecteurs futurs devront imposer la session owner/admin, une association serveur compte/tenant, une lecture Brevo fraîche et la vérification de l'identifiant externe. Un parcours de résolution audité avec contrôle de concurrence reste à concevoir avant tout déverrouillage. La synchronisation réelle reste inactive.

Ces fichiers sont préparés localement dans le checkout de travail, sans commit ni push. La CI de 818d3706 ne couvre pas ces nouveaux fichiers. Avant publication : reprendre sur la tête exacte et préparer la configuration Brevo du déploiement Preview, puis vérifier CI et trois Vercel. Aucun changement de main ni fusion.

## Raccordement serveur ajouté à 21 h 32

`services/brevo-contact-observer.ts` lit uniquement GET /v3/contacts/{identifier}?identifierType=ext_id, sur origine Brevo fixe, sans redirection/cache, délai de 10 secondes, désactivation par défaut. Les erreurs, JSON invalides et identités incohérentes donnent unknown ; seul 404 document_not_found donne absent. L'identité peut provenir de la recherche ext_id quand Brevo omet ce champ dans sa réponse (documentation officielle consultée le 27 septembre).

`repositories/brevo-contact-reconciliation.ts` compose le lecteur du journal via client Supabase authentifié/RLS, la source de personne existante, l'observateur et l'évaluation. Le tenant est dérivé de la session owner/admin puis comparé à la configuration serveur. Les lectures suivantes revérifient utilisateur/tenant/rôle. Aucune méthode d'écriture ni de résolution du verrou n'est exposée.

Validation : 147 tests contacts sur 8 fichiers réussis (25 ajoutés à cette étape), contrôle TypeScript complet du checkout et lint ciblé réussis. Tests simulés uniquement : les résultats ne prouvent ni configuration d'un compte Brevo réel ni accès à une base distante. Le changelog Supabase et la page maybeSingle n'ont pas été récupérables via recherche ; les appels conservent la convention existante du dépôt sans nouvelle API.

Toujours local/non publié : pas de route utilisateur, pas de variable Vercel, pas de migration distante, pas de contact modifié, pas d'envoi. La mise à disposition en QA et un parcours de résolution persistante audité restent à réaliser.


## Publication préparée sur la branche de sécurité

Les étapes locales ci-dessus décrivent l'historique. Ce lot ajoute uniquement les six fichiers de code/tests et cette note sur la tête 818d3706 de agent/security-hardening-2026-09-26 (PR Draft 69). Aucun fichier existant n'est remplacé. Les résultats CI et Vercel de ce nouveau commit sont à consigner dans la PR après publication. Les fonctions restent sans route appelante et désactivées par défaut.
