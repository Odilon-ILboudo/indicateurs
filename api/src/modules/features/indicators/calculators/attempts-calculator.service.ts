// api/src/modules/features/indicators/calculators/attempts-calculator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PlatonService } from '../../../core/platon/platon.service';

@Injectable()
export class AttemptsCalculatorService {
  private readonly logger = new Logger(AttemptsCalculatorService.name);

  constructor(private readonly platonService: PlatonService) {}

  /**
   * Calcule le nombre moyen de tentatives avant la première réussite
   * pour un utilisateur sur une activité spécifique
   * 
   * La colonne "attempts" représente le nombre de tentatives effectuées
   * (ex: 1 = première tentative, 2 = deuxième tentative, etc.)
   */
  async calculateForActivity(userId: string, activityId: string): Promise<number> {
    this.logger.log(` ========== DEBUT CALCUL ==========`);
    this.logger.log(` Calcul pour user: ${userId}`);
    this.logger.log(` Activité: ${activityId}`);

    try {
      // 1. Récupérer les données
      this.logger.log(` 1. Récupération des SessionData...`);
      const sessionData = await this.platonService.getUserSessionDataByActivity(userId, activityId);
      
      this.logger.log(` SessionData reçues: ${sessionData?.length || 0} enregistrements`);
      
      if (!sessionData || sessionData.length === 0) {
        this.logger.warn(`⚠️ Aucune donnée pour user ${userId}, activité ${activityId}`);
        return 0;
      }

      // 2. Grouper par exercice
      this.logger.log(` 2. Groupement par exercice...`);
      const exercisesMap = new Map<string, { grade: number; attempts: number; createdAt: Date }[]>();

      for (const record of sessionData) {
        const exerciseKey = record.resource_id || `activity_${record.activity_id}_${record.id}`;
        
        if (!exercisesMap.has(exerciseKey)) {
          exercisesMap.set(exerciseKey, []);
        }
        
        exercisesMap.get(exerciseKey)!.push({
          grade: record.grade,
          attempts: record.attempts,
          createdAt: new Date(record.created_at),
        });
      }

      this.logger.log(` ${exercisesMap.size} exercices distincts trouvés`);

      // 3. Calculer les tentatives avant réussite
      this.logger.log(` 3. Calcul des tentatives avant réussite...`);
      let totalAttemptsBeforeSuccess = 0;
      let successfulExercises = 0;

      for (const [exerciseKey, attempts] of exercisesMap.entries()) {
        // Trier par date croissante
        attempts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        
        this.logger.log(`  Analyse exercice: ${exerciseKey.substring(0, 30)}...`);
        this.logger.log(`    Nombre d'enregistrements: ${attempts.length}`);
        
        let attemptsBeforeSuccess = 0;
        let foundSuccess = false;
        
        for (let i = 0; i < attempts.length; i++) {
          this.logger.log(`      Enregistrement ${i + 1}: grade=${attempts[i].grade}, attempts=${attempts[i].attempts}`);
          
          //  CORRECTION : Utiliser la valeur de la colonne "attempts"
          if (attempts[i].grade === 100) {
            // attemptsBeforeSuccess = attempts[i].attempts;  // ← La colonne attempts contient déjà le nombre
            attemptsBeforeSuccess = attempts[i].attempts;
            foundSuccess = true;
            this.logger.log(`     Réussite trouvée: ${attemptsBeforeSuccess} tentative(s) selon colonne attempts`);
            break;
          }
        }
        
        if (foundSuccess && attemptsBeforeSuccess > 0) {
          totalAttemptsBeforeSuccess += attemptsBeforeSuccess;
          successfulExercises++;
          this.logger.log(`     Exercice réussi: ${attemptsBeforeSuccess} tentative(s)`);
        } else {
          this.logger.log(`    ❌ Exercice non réussi (pas de grade=100)`);
        }
      }

      // 4. Calculer la moyenne
      this.logger.log(` 4. Calcul de la moyenne...`);
      this.logger.log(`   Total tentatives avant réussite: ${totalAttemptsBeforeSuccess}`);
      this.logger.log(`   Nombre d'exercices réussis: ${successfulExercises}`);
      this.logger.log(`   Nombre total d'exercices: ${exercisesMap.size}`);
      
      const average = successfulExercises > 0 ? totalAttemptsBeforeSuccess / successfulExercises : 0;
      
      this.logger.log(` RÉSULTAT FINAL: ${average.toFixed(2)} tentatives`);
      this.logger.log(` ========== FIN CALCUL ==========`);
      
      return average;
    } catch (error) {
      this.logger.error(`❌ Erreur lors du calcul: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Version avec plus de détails pour le débogage
   */
  async calculateForActivityWithDetails(userId: string, activityId: string): Promise<{
    average: number;
    successfulExercises: number;
    totalAttempts: number;
    totalExercises: number;
    details: { exerciseKey: string; attemptsValue: number; attemptsBeforeSuccess: number }[];
  }> {
    const sessionData = await this.platonService.getUserSessionDataByActivity(userId, activityId);
    
    if (!sessionData || sessionData.length === 0) {
      return { average: 0, successfulExercises: 0, totalAttempts: 0, totalExercises: 0, details: [] };
    }

    const exercisesMap = new Map<string, { grade: number; attempts: number; createdAt: Date }[]>();
    
    for (const record of sessionData) {
      const exerciseKey = record.resource_id || `exercise_${record.id}`;
      if (!exercisesMap.has(exerciseKey)) {
        exercisesMap.set(exerciseKey, []);
      }
      exercisesMap.get(exerciseKey)!.push({
        grade: record.grade,
        attempts: record.attempts,
        createdAt: new Date(record.created_at),
      });
    }

    let totalAttemptsBeforeSuccess = 0;
    let successfulExercises = 0;
    const details: { exerciseKey: string; attemptsValue: number; attemptsBeforeSuccess: number }[] = [];

    for (const [exerciseKey, attempts] of exercisesMap.entries()) {
      attempts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      let attemptsBeforeSuccess = 0;
      let attemptsValue = 0;
      let foundSuccess = false;
      
      for (let i = 0; i < attempts.length; i++) {
        if (attempts[i].grade === 100) {
          attemptsBeforeSuccess = attempts[i].attempts;
          attemptsValue = attempts[i].attempts;
          foundSuccess = true;
          break;
        }
      }
      
      details.push({
        exerciseKey,
        attemptsValue,
        attemptsBeforeSuccess: foundSuccess ? attemptsBeforeSuccess : -1,
      });
      
      if (foundSuccess && attemptsBeforeSuccess > 0) {
        totalAttemptsBeforeSuccess += attemptsBeforeSuccess;
        successfulExercises++;
      }
    }

    const average = successfulExercises > 0 ? totalAttemptsBeforeSuccess / successfulExercises : 0;
    
    return {
      average,
      successfulExercises,
      totalAttempts: totalAttemptsBeforeSuccess,
      totalExercises: exercisesMap.size,
      details,
    };
  }
}