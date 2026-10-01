# Recherche et qualification des prospects

## Première étape développée le 30 septembre 2026

Page authentifiée `/prospects`, accessible dans la navigation. Recherche publique
par code postal auprès de l'API Recherche d'entreprises (25 unités légales par page).
Les résultats affichent les établissements locaux actifs et diffusibles de l'activité
68.31Z, avec SIRET, ville, date de recherche et source officielle. Déduplication
des établissements par SIRET ; vérification des organisations Atlas par SIREN,
dans le tenant connecté et avec le client Supabase soumis aux RLS.

La recherche ne crée aucun contact et ne lance aucune campagne. Elle ne stocke
ni dirigeants, ni dates de naissance, ni adresses personnelles dans Atlas.
Un indépendant n'est pas automatiquement qualifié comme mandataire ; une société
n'est pas automatiquement qualifiée comme agence disposant d'une équipe.

Documentation consultée et réponse réelle contrôlée :
- https://recherche-entreprises.api.gouv.fr/docs/
- https://recherche-entreprises.api.gouv.fr/openapi.json
- https://www.data.gouv.fr/dataservices/api-recherche-dentreprises

Les filtres d'activité et d'état portent sur l'unité légale. L'application vérifie
donc aussi chaque établissement : une société active peut renvoyer une agence
locale fermée et un siège hors secteur. Limite de 100 pages et 100 établissements
connexes par unité : pas de promesse d'exhaustivité. L'activité 68.31Z correspond
au champ actuel `activite_principale`, pas au nouveau champ `activite_principale_naf25`.

## Étapes suivantes du parcours complet

1. Listes persistantes ajoutées le 1 octobre : sauvegarde de la page après relecture de la source, 20 dernières listes consultables, isolation par tenant via RLS. Schéma installé sur QA seulement. Chaque liste demeure à examiner ; aucune validation ou transmission implicite.
2. Collecte des fiches des réseaux et sites professionnels ; source et date par donnée.
3. Enrichissement téléphone/email sans adresses inventées ; conflits à examiner.
4. Qualification agence/mandataire, secteur et choix humain de retenir/écarter.
5. Déduplication personnes et organisations, intégration explicite au pipeline.
6. Transmission à Brevo après validation ; exclusions réponse/RDV/STOP.

Le fichier pilote fourni contient 20 profils LinkedIn distincts, 0 email et 1 téléphone.
Il ne constitue pas une liste prête à contacter. Données d'import datées de mai 2025.
9 localisations Saint-Maur, 6 Paris et périphérie, 3 autres régions, 2 imprécises.
La mention Paris et périphérie ne permet pas d'inventer un département.

L'intégration Calendly et les SMS restent sur leur branche dédiée ; la séquence
Brevo 2 demeure inactive. Ce module ne modifie aucun réglage de campagne.
