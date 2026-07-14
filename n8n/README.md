# n8n

Ce dossier prepare l'architecture des workflows.

Les automatisations Brevo ne sont pas developpees dans ce ticket. Les futurs workflows devront respecter :

- le multi-tenant strict ;
- l'arret de sequence en cas de reponse ou refus ;
- la verification `do_not_contact` avant tout envoi ;
- la journalisation des actions significatives.
