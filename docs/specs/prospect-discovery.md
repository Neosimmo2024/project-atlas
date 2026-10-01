# Recherche et qualification des prospects

## Première cible demandée : Saint-Maur-des-Fossés

Le formulaire propose par défaut Saint-Maur-des-Fossés uniquement. Cette cible
utilise `code_commune=94068` auprès de la source et contrôle aussi le champ
`commune` de chaque établissement, ainsi que ses codes postaux 94100 ou 94210.
La Varenne est incluse, les communes voisines sont exclues. Le choix « Autre
secteur » permet de changer de code postal pour une recherche ultérieure.
La cible est conservée dans la pagination, lors de la relecture et dans la liste
enregistrée (`target_key`, schéma `prospect-target.sql`). Les anciens liens par
code postal et les anciennes listes conservent leur périmètre initial.

Contrôle réel de la source le 1 octobre : le filtre commune renvoie des
établissements 94100 et 94210 avec `commune=94068`. Les totaux de la source ne sont
pas des nombres de contacts qualifiés. La restriction concerne la collecte des
prospects ; elle ne modifie pas les versions régionales des SMS déjà préparées.

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
4. Qualification manuelle ajoutée le 1 octobre : activité agence/mandataire, téléphone/email professionnels, URL source, notes et choix à vérifier/retenu/écarté. La qualification reste déclarative : aucun enrichissement automatique ni vérification automatique de la joignabilité.
5. Intégration ajoutée : interlocuteur identifié, aperçu du parcours d'import existant, contrôle des doublons, confirmation et option pipeline en détection. Historique et transaction réutilisés.
6. Transmission à Brevo après validation ; exclusions réponse/RDV/STOP.

Le fichier pilote fourni contient 20 profils LinkedIn distincts, 0 email et 1 téléphone.
Il ne constitue pas une liste prête à contacter. Données d'import datées de mai 2025.
9 localisations Saint-Maur, 6 Paris et périphérie, 3 autres régions, 2 imprécises.
La mention Paris et périphérie ne permet pas d'inventer un département.

L'intégration Calendly et les SMS restent sur leur branche dédiée ; la séquence
Brevo 2 demeure inactive. Ce module ne modifie aucun réglage de campagne.

## Vérification individuelle

Chaque prospect d'une liste dispose d'une fiche de vérification. Les rôles owner,
admin, recruiter et manager peuvent l'enregistrer. Le serveur vérifie le tenant et
la présence du SIRET dans la liste ; les mêmes restrictions sont appliquées par RLS.
Les identifiants de la revue sont immuables. La base date chaque enregistrement.
Retenir un prospect exige une activité confirmée, au moins un téléphone/email et
une source. La simple décision ne crée pas de fiche et ne vaut pas autorisation
d'envoi. La validation des coordonnées est syntaxique.

Schémas QA : `supabase/cron/prospect-lists.sql`, puis `prospect-reviews.sql`.
L'identité de l'interlocuteur est ajoutée par `prospect-contact-identity.sql`.
Le CLI Supabase n'étant pas installé dans cet environnement, ces scripts sont
versionnés explicitement ; les migrations correspondantes ont été appliquées via
le connecteur sur `mahgxumwucxehsooijag` uniquement. Les convertir en migrations
canoniques avec le CLI avant une installation sur un autre environnement.

Vérifications du 1 octobre : 28 tests ciblés (prospects et gestion réseau login),
TypeScript, ESLint ; contrôles SQL annulés par ROLLBACK : écriture propriétaire,
refus d'un SIRET hors liste, refus d'une qualification sans coordonnées et isolation
lecture/écriture d'un non-membre. Aucun signalement prospect par l'advisor sécurité.
Recette navigateur encore bloquée après la saisie sécurisée des identifiants.
Le workflow `Prospect discovery checks` couvre cette PR empilée ; il ne remplace
pas la CI Supabase complète ni la recette interactive avant fusion.

## Intégration au recrutement

Un profil retenu avec un nom d'interlocuteur ouvre `/prospects/[listId]/[siret]/integrate`.
Le serveur relit la liste et la revue dans le tenant connecté et prépare une seule
ligne pour le parcours d'import existant. Le nom de société n'est jamais utilisé
comme identité de personne. Le prénom peut rester vide. Les champs source et
commentaires restent attachés aux fiches créées.

L'utilisateur examine les doublons, choisit sa décision, l'option pipeline puis
confirme l'identité et la joignabilité professionnelle de l'interlocuteur. L'API
`/api/prospects/integrate` relit les données et ignore tout contenu de contact,
tenant ou clé d'exécution fourni par le navigateur. Une revue modifiée invalide
l'aperçu. Les correspondances marquées Ne plus contacter bloquent l'opération.

Le moteur CSV existant effectue la transaction. Il conserve les fiches existantes,
crée les fiches manquantes selon la décision choisie et rend un rapport détaillé
dans l'historique des imports. Une ligne sans personne ou organisation éligible
peut être ignorée pour le pipeline : lire le rapport, ne pas assimiler une réponse
réussie à la création systématique d'une relation. Les nouvelles personnes restent
avec `contact_allowed=false`. Aucun appel Brevo ni Calendly depuis ce parcours.

La clé est stable pour la version de revue. Une reprise retourne le rapport
existant ; une intégration faisant l'objet d'une annulation renvoie vers l'historique.
Une nouvelle vérification crée une nouvelle version qui reste soumise aux doublons.

Validation : 98 tests ciblés (prospects, API et régressions import), TypeScript et
ESLint. Test QA transactionnel annulé : création personne/organisation/relation,
phase détection, autorisation de contact laissée à false, répétition idempotente,
aucune variation des journaux de séquences email ou de tentatives SMS.
La recette interactive et la collecte automatique des coordonnées restent ouvertes.

## Contrôle LinkedIn complémentaire — 1 octobre

Rubrique déclarative dédiée : URL de profil `/in/`, résultat (non contrôlé,
introuvable, inaccessible, cohérent, contradiction), activité, réseau, secteur,
faits observés et date de consultation/tentative. Les résultats documentés exigent
une date ; cohérent/contradiction exigent profil et faits. Cohérent exige aussi
activité et secteur. Une contradiction empêche le statut retenu, y compris en
base et lors de la préparation d'intégration. Un profil absent/inaccessible n'est
pas un rejet automatique. Aucune recherche LinkedIn automatique ni score déduit.
La mention Paris et périphérie ne confirme pas le secteur Saint-Maur.

Les éléments du contrôle sont transmis dans les commentaires de l'import ; le
moteur existant conserve les fiches déjà présentes sans écrasement implicite.
Schéma QA additionnel : `supabase/cron/prospect-linkedin.sql`. Les RLS, la date
serveur et l'auteur de la revue continuent de s'appliquer. Migration canonique CLI
à préparer avant installation sur un autre environnement, comme les scripts précédents.
Validation : 37 tests ciblés (incluant 5 nouveaux cas LinkedIn), TypeScript,
ESLint et transaction QA annulée (insert/update, garde contradiction/preuves,
isolation d'un non-membre). Pas de signalement prospect par l'advisor sécurité.
La recette navigateur reste ouverte ; aucune qualification de profil réel revendiquée.

Recherche réelle des 15 pages le 1 octobre à 07:56 UTC : total source 363 unités
légales ; 252 établissements uniques retenus, 246 SIREN ; 167 en 94100, 85 en
94210. Ce sont des pistes d'établissements, pas 252 personnes joignables.
L'enregistrement multi-page était alors à développer (voir complément ci-dessous). L'enrichissement automatique reste à développer.

## Collecte multi-page — 1 octobre, complément

Le bouton « Enregistrer toutes les pages dans une liste » relit les résultats
à partir de la page 1, avec au plus trois requêtes simultanées, déduplique par
SIRET et écrit une seule liste après succès de toutes les pages. La collecte
est limitée à 20 pages et 2 500 établissements ; au-delà, la sauvegarde par page
reste disponible. Une panne ou une variation du nombre de pages/résultats
interrompt la sauvegarde. Cela ne constitue pas un instantané transactionnel de
la source externe ni une garantie d'exhaustivité.

La route autorise 120 secondes, les appels source conservent leur timeout de
12 secondes. Le formulaire signale l'attente et désactive les boutons pendant
la soumission. La liste multi-page conserve `source_page=1` (page de départ).
Aucun nouveau schéma ; droits et isolation tenant inchangés.

Essai réel du nouveau collecteur : 15 pages, 252 SIRET uniques en 21,8 secondes,
uniquement 94100/94210. Tests : 4 cas collecteur (pagination/doublons, panne ou
variation, limite, concurrence) et 2 cas action (écriture unique / aucune écriture
partielle), en plus des contrôles existants. TypeScript et ESLint OK.
La sauvegarde dans le navigateur reste à recetter après résolution de la connexion.
La recherche automatique web/LinkedIn et les coordonnées restent non implémentées.
