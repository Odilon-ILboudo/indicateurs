import { MigrationInterface, QueryRunner } from "typeorm";

// Sépare la complétude réelle du formulaire (isComplete) de la publication manuelle
// (isActive, inchangée). Défaut false : les indicateurs existants restent incomplets
// tant qu'ils n'ont pas été ré-enregistrés via le bouton final du wizard.
export class IndicatorIsComplete1786600000000 implements MigrationInterface {
    name = 'IndicatorIsComplete1786600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "indicator_definitions" ADD "isComplete" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "indicator_definitions" DROP COLUMN "isComplete"`);
    }

}
