# Collecte VSC depuis un hébergeur externe — recette QA

Ce composant n’est pas installé et aucune planification n’est activée. Il permet de déclencher les trois collecteurs existants depuis un hébergement disposant de Node 22 et d’un planificateur. Il ne lance aucun email/SMS, ne crée aucune campagne et ne consulte aucun autre tenant.

## Ce qui est exécuté

`node scripts/vsc-collection-poll.mjs --run` appelle, dans cet ordre, exclusivement la preview QA de la branche VSC :

1. `/api/cron/vsc-replies` : réponses OVH avec référence exacte.
2. `/api/cron/vsc-historical-inbound` : messages humains de destinataires historiques, mise en pause conservatrice.
3. `/api/cron/vsc-sms-stops` : blocages Brevo du compte VSC dédié.

Chaque traitement est borné à un lot. Les collecteurs indépendants suivants sont interrogés même si un précédent échoue. Aucun retry dans le processus ; les checkpoints des workers permettent une reprise lors d’une invocation ultérieure. Le compte rendu JSON ne conserve que les compteurs autorisés, sans coordonnées, messages, secret ou erreur brute.

## Conditions avant installation

- Prévisualisation QA du commit validé et ses migrations appliquées. La production est refusée par ce script ; il ne faut pas changer sa cible pour contourner ce verrou.
- Sur la preview QA uniquement : `VSC_REPLY_CRON_ENABLED=true`, `VSC_HISTORICAL_INBOUND_CRON_ENABLED=true`, `VSC_SMS_STOPS_CRON_ENABLED=true`, tenant VSC et acteurs owner/admin actifs configurés pour les deux derniers collecteurs. Les RPC vérifient les droits de ces acteurs à chaque invocation.
- Identité OVH et compte Brevo VSC dédiés déjà vérifiés. Les mots de passe OVH et la clé Brevo restent dans l’application : ne pas les copier sur le planificateur.
- `CRON_SECRET` partagé avec l’application, conservé dans les secrets de l’hébergeur et injecté dans l’environnement du processus. Ne pas remplacer un secret partagé déjà utilisé par d’autres tâches. Ne pas le passer en argument, l’inscrire dans une URL, le journaliser ou le placer dans Git.
- `VSC_COLLECTION_RUN_ENABLED=true` est un verrou local propre au planificateur. Il n’autorise aucun envoi. Toutes les variables d’envoi commercial restent désactivées.

`node scripts/vsc-collection-poll.mjs --check` vérifie uniquement la cible et la présence/forme du secret local, sans réseau. Un résultat `ready` ne prouve ni l’activation des routes distantes ni le bon fonctionnement d’OVH/Brevo.

## Exécution et surveillance

Recetter d’abord une invocation manuelle du script sur l’hébergement de test, puis une seconde pour vérifier la reprise. Contrôler le journal et les checkpoints Atlas, ainsi que l’absence de nouvelles livraisons commerciales et l’isolation NEOS IMMO.

Exemple de commande à adapter par l’exploitant Linux, après installation du dépôt au chemin retenu et injection des secrets par l’hébergeur :

```sh
flock -n /run/lock/atlas-vsc-collection.lock node /srv/project-atlas/scripts/vsc-collection-poll.mjs --run
```

Prévoir une invocation toutes les dix minutes, un répertoire de verrou accessible au compte de service, une limite d’exécution supérieure à sept minutes et une alerte sur les sorties non nulles ou l’absence de compte rendu depuis vingt minutes. `flock` empêche le chevauchement sur un même hébergeur ; un seul planificateur doit être installé. Aucune tâche cron n’est ajoutée par le dépôt.

| Code de sortie | Signification | Suite |
| --- | --- | --- |
| 0 | Trois collectes complètes | Attendre l’échéance suivante |
| 1 | Échec HTTP, lecture ou résultat invalide | Examiner le bilan et l’application ; aucun succès global annoncé |
| 2 | Pages restantes ou STOP inconnus/non rapprochés | Examiner le retard ou les contacts ; aucune preuve de synchronisation complète |
| 3 | Configuration invalide ou verrou local désactivé | Corriger la configuration avant installation |
| 64 | Arguments invalides | Utiliser `--check` ou `--run` |

L’absence de nouveau message peut être normale ; l’absence de passage réussi doit être détectée par l’hébergeur. Cette surveillance et la planification restent à installer et à recetter sur l’hébergement retenu. Le script ne prouve pas une collecte continue tant que cela n’a pas été fait.

## Variante PHP pour l’hébergement OVH PRO vérifié

La variante `scripts/vsc-collection-poll.php` remplace le lanceur Node sur cet hébergement. Elle s’exécute **sans argument**, comme l’exige le formulaire Cron OVH. PHP 8.2 ou supérieur et l’extension cURL sont nécessaires. Les cinq tests Node restent distincts des six tests de la variante PHP.

Installation prévue, encore non effectuée :

- Dossier privé `/home/vendrec/atlas-vsc-collection`, hors de `www` et `www/public`, permissions `0700`.
- Copier uniquement `vsc-collection-poll.php` dans ce dossier. Aucun fichier du site existant n’est remplacé.
- Créer dans ce même dossier `vsc-collection.config.json`, appartenant au même compte que le script, permissions `0600`. Les liens symboliques, fichiers lisibles par le groupe/autres et configurations trop volumineuses sont refusés.
- Structure privée : `{"version":1,"enabled":false,"cronSecret":""}`. Le secret existant de l’application QA doit être renseigné par un canal sécurisé ; aucun exemple de secret valide n’est enregistré dans Git. Le booléen `enabled` reste `false` tant que la recette n’est pas validée.
- Sur l’hébergement, lancer `php vsc-collection-poll.php --check` : contrôle sans réseau de la configuration locale. Tester ensuite l’exécution complète en CLI après configuration et activation des seuls collecteurs QA. Un verrou de fichier intégré refuse les exécutions qui se chevauchent.
- Le formulaire Cron doit viser `atlas-vsc-collection/vsc-collection-poll.php` depuis le home. Choisir une version PHP compatible, sans modifier la version globale du site. Créer initialement la tâche **désactivée** ; contrôler le chemin et le résultat avant toute activation.

**Limite vérifiée OVH mutualisé : une invocation par heure maximum**, minute non réglable, et non toutes les dix minutes. Le planificateur Linux décrit plus haut concerne un autre type d’hébergement. Il faut choisir et recetter une cadence adaptée avant de déclarer la collecte continue opérationnelle. Ne pas multiplier les crons ni faire tourner une boucle permanente pour contourner cette limite.

Le script PHP refuse les appels HTTP, les dossiers contenant un segment `www` ou `public`, les cibles alternatives, les redirections, les réponses trop grandes et les résultats incomplets. TLS reste vérifié ; aucune erreur brute, coordonnée ou valeur secrète n’est imprimée. Les codes de sortie ont le même sens que le lanceur Node, avec le code 2 également utilisé quand une invocation est déjà en cours. Le script doit rester privé même avec ce refus HTTP.

Si la protection de la prévisualisation Vercel refuse l’appel machine, le bilan est en échec ; ne pas désactiver cette protection pour obtenir artificiellement un succès. L’accès machine autorisé et les flags distants doivent être vérifiés lors de l’installation.

Source des contraintes OVH : https://docs.ovhcloud.com/en/guides/web-cloud/web-hosting/cron-tasks (consulté le 3 novembre 2026).
