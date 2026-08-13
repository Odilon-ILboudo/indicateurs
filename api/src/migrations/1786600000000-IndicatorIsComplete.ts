import { MigrationInterface, QueryRunner } from "typeorm";

// Sépare la complétude réelle du formulaire (isComplete) de la publication manuelle
// (isActive, inchangée) - voir indicator-definition.entity.ts et
// indicator-builder.component.ts#submit(). Défaut false : tous les indicateurs déjà
// existants sont considérés incomplets tant qu'ils n'ont pas été ré-enregistrés via le
// bouton final du wizard (comportement voulu : pas de rétro-complétion automatique sans
// revalidation réelle des champs).
export class IndicatorIsComplete1786600000000 implements MigrationInterface {
    name = 'IndicatorIsComplete1786600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "indicator_definitions" ADD "isComplete" boolean NOT NULL DEFAULT false`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "indicator_definitions" DROP COLUMN "isComplete"`);
    }

}
