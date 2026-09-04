/*
Exchange RabbitMQ partagé avec le relais côté LMS hôte (voir docs/integration-platon-relay.md),
qui y publie, consommé ici. Nom conservé stable pour ne pas avoir à reconfigurer le relais si
ce fichier bouge côté Indicateurs.
*/
export const PLATON_EXCHANGE = 'platon.events';
