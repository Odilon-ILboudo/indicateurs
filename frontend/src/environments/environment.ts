export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/api',
  indicatorsApiUrl: 'http://localhost:3001/api',
  platonBaseUrl: 'https://platon.univ-eiffel.fr',
  /*
  API PLaTon locale (docker-compose.dev.yml + `yarn serve:api`) - permet de se connecter avec
  un compte local (ex: créé directement en base) sans dépendre du CAS de production.
  */
  platonLocalApiUrl: 'http://localhost:4201',
};