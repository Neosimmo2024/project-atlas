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
