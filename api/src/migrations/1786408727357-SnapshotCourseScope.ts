import { MigrationInterface, QueryRunner } from "typeorm";

// Permet à un snapshot de groupe (indicator_snapshots) d'être scopé soit à une
// activité précise (comportement existant, activityId), soit à tout un cours
// à la fois (nouveau, courseId - toutes les activités du cours agrégées pour
// ce groupe, voir isCourseAware()). Exactement l'un des deux, jamais les deux,
// jamais aucun (contrainte CHECK ci-dessous).
export class SnapshotCourseScope1786408727357 implements MigrationInterface {
    name = 'SnapshotCourseScope1786408727357'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" DROP CONSTRAINT "UQ_6237c0c6c3943a85c68002f0b21"`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" ALTER COLUMN "activityId" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" ADD "courseId" character varying`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" ADD CONSTRAINT "CHK_indicator_snapshots_scope" CHECK (
            ("activityId" IS NOT NULL AND "courseId" IS NULL) OR ("activityId" IS NULL AND "courseId" IS NOT NULL)
        )`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_indicator_snapshots_activity" ON "indicator_snapshots" ("indicatorId", "contextType", "contextId", "activityId") WHERE "activityId" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_indicator_snapshots_course" ON "indicator_snapshots" ("indicatorId", "contextType", "contextId", "courseId") WHERE "courseId" IS NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."UQ_indicator_snapshots_course"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_indicator_snapshots_activity"`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" DROP CONSTRAINT "CHK_indicator_snapshots_scope"`);
        await queryRunner.query(`DELETE FROM "indicator_snapshots" WHERE "activityId" IS NULL`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" DROP COLUMN "courseId"`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" ALTER COLUMN "activityId" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "indicator_snapshots" ADD CONSTRAINT "UQ_6237c0c6c3943a85c68002f0b21" UNIQUE ("indicatorId", "contextType", "contextId", "activityId")`);
    }

}
