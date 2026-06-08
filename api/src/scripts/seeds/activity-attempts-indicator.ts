// scripts/seeds/activity-attempts-indicator.ts
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import * as path from 'path';
import { randomUUID } from 'crypto';

config({ path: path.join(__dirname, '../../.env') });

async function seed() {
  console.log('Seed de l\'indicateur "Tentatives avant première réussite par activité"...');

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.INDICATORS_DB_HOST,
    port: parseInt(process.env.INDICATORS_DB_PORT || '5432', 10),
    username: process.env.INDICATORS_DB_USERNAME,
    password: process.env.INDICATORS_DB_PASSWORD,
    database: process.env.INDICATORS_DB_NAME,
    synchronize: false,
    logging: true,
  });

  try {
    await dataSource.initialize();
    console.log('Connexion établie');

    const indicatorId = randomUUID();
    const indicator = {
      id: indicatorId,
      name: 'Tentatives avant première réussite',
      description: 'Nombre moyen de tentatives avant la première réussite des exercices d\'une activité',
      contextType: 'learner',
      requiredEvents: ['exercise.answered'],
      visualizations: [{
        id: randomUUID(),
        label: 'Vue carte',
        type: 'card',
        icon: 'trending_up',
        color: '#722ed1',
        unit: 'tentatives',
        thresholds: { good: 1, warning: 3, danger: 5 },
      }],
      isActive: true,
    };

    const existing = await dataSource.query(
      'SELECT id FROM indicator_definitions WHERE name = $1',
      [indicator.name],
    );

    if (existing.length > 0) {
      console.log('Indicateur déjà existant, seed ignoré');
    } else {
      await dataSource.query(
        `INSERT INTO indicator_definitions
         ("id", "name", "description", "contextType", "requiredEvents", "visualizations", "isActive")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)`,
        [
          indicator.id,
          indicator.name,
          indicator.description,
          indicator.contextType,
          JSON.stringify(indicator.requiredEvents),
          JSON.stringify(indicator.visualizations),
          indicator.isActive,
        ],
      );
      console.log('Indicateur créé avec succès');
    }

    console.log('Seed terminé avec succès');
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await dataSource.destroy();
  }
}

seed();
