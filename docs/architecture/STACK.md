# Stack technique V1

## Choix figes

- Next.js pour l'interface et les Route Handlers
- Supabase pour PostgreSQL, Auth et Storage
- n8n pour les workflows
- Brevo pour email et SMS
- OpenAI pour l'IA via une couche d'abstraction
- Vercel pour le deploiement

## Pourquoi

Cette stack minimise le cout et le delai de mise sur le marche tout en reposant sur PostgreSQL, ce qui permet une migration future sans reconstruire le modele de donnees.

## Regle

Aucun nouvel outil n'est ajoute pendant le Sprint 001 sans necessite bloquante.
