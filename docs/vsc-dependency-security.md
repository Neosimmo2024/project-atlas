# Dépendances — contrôle avant déploiement VSC, 3 novembre 2026

L’audit initial du verrou existant signale 26 entrées : une critique, huit hautes et dix-sept modérées. Ce comptage décrit les dépendances signalées ; il ne prouve aucune exploitation sur un déploiement.

## Correctifs préparés sur la branche de recette

- Next.js 15.5.20 → 15.5.28 et eslint-config-next aligné en 15.5.28.
- sharp 0.34.5 → 0.35.5, avec ses bibliothèques natives corrigées, via les dépendances publiées de Next.js.
- csv-parse 7.0.3, Vitest 4.1.12 et Zod 4.6.7, versions directes fixées dans le manifeste.
- Mises à jour compatibles des dépendances transitives affectées, dont Vite, js-yaml, nanoid et source-map-js.
- Overrides explicites et bornés dans le manifeste racine : PostCSS 8.5.32 (même version majeure, y compris la dépendance épinglée par Next 15) et brace-expansion 1.1.21 pour la branche 1.x. Le verrou résout également brace-expansion 5.0.12 pour la branche 5.x.

Le verrou corrigé est vérifié par une installation propre `npm ci --ignore-scripts --no-audit`, les tests de l’application et une compilation Next complète. Aucune migration de base, donnée de campagne, variable distante ou activation d’envoi n’est modifiée. La recette de prévisualisation et les résultats CI sont consignés dans la PR #88. Toute mise en production reste soumise à approbation.

## Résultat de l’audit après correction

**Zéro alerte critique et zéro alerte haute.** Quatorze entrées modérées restent dans la chaîne de développement ESLint/TypeScript-ESLint/minimatch. Les propositions automatiques restantes impliquent des changements majeurs ou des retours de version de l’outillage ; elles ne sont pas appliquées avec `--force`. Elles restent un point de maintenance explicite, sans être présentées comme corrigées.

La CI est étendue aux modifications de manifestes/verrou et contrôle les dépendances d’exécution avec `npm audit --omit=dev --audit-level=high`. Les audits dépendent de la base d’avis du registre à la date d’exécution ; ils ne remplacent pas les tests RLS, l’isolation des entreprises ou la recette complète.

## Sources primaires

- Avis Next.js critique, correction 15.5.28 et dépendance sharp corrigée : https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw
- Avis PostCSS : https://github.com/advisories/GHSA-fxqj-rqcc-2cmp
- Fonctionnement des overrides npm : https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides

Aucun envoi, fusion, changement de compte NEOS IMMO ou déploiement en production n’a été effectué pour ce correctif.
