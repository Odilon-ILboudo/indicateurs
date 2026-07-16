import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1784208486667 implements MigrationInterface {
    name = 'InitialSchema1784208486667'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "indicator_pins" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "indicatorId" character varying NOT NULL, "contextType" character varying NOT NULL, "contextId" character varying NOT NULL, "thresholdsOverride" jsonb, "pinnedByUserId" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b13142b715287ab80f22312633e" UNIQUE ("indicatorId", "contextType", "contextId"), CONSTRAINT "PK_f53aa3e81d1d1a2d90482850dbe" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_600fa67797054594a9e93e9a5b" ON "indicator_pins" ("contextType", "contextId") `);
        await queryRunner.query(`CREATE TABLE "indicator_event_types" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "label" character varying NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e62ad9159fb664891fd205c88ee" UNIQUE ("name"), CONSTRAINT "PK_d9a2f3cfdb2feb07db813cf54b2" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "indicator_event_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "event_type_id" uuid NOT NULL, "source_table" character varying NOT NULL, "watched_column" character varying, "operation" character varying NOT NULL DEFAULT 'UPDATE', "condition" jsonb NOT NULL, "context_mapping" jsonb NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "trigger_installed" boolean NOT NULL DEFAULT false, "installed_at" TIMESTAMP WITH TIME ZONE, "last_applied_sql" text, "last_install_error" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6c7879fb7c2775163ee8e4b45fd" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "indicator_definitions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" text, "contextType" character varying, "familyName" character varying(255), "baseIndicatorId" character varying, "requiredEvents" jsonb NOT NULL, "visualizations" jsonb, "isActive" boolean NOT NULL DEFAULT true, "isFamilyPlaceholder" boolean NOT NULL DEFAULT false, "usageCount" integer NOT NULL DEFAULT '0', "formula" jsonb, "thresholds" jsonb, "interpretationHint" text, "visibilityRoles" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_636cceac27153a0685ca5f289ab" UNIQUE ("name"), CONSTRAINT "PK_53e1b4f841fe9d762c0875b28bc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_61f4c7ff0d29bb9f484fe7e035" ON "indicator_definitions" ("isActive") `);
        await queryRunner.query(`CREATE TABLE "indicator_values" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "indicatorId" uuid NOT NULL, "contextType" character varying NOT NULL, "contextId" character varying NOT NULL, "value" double precision NOT NULL DEFAULT '0', "metadata" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_611038cccc7a74de92fed3da44d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_9300af983113cf7753d30bc129" ON "indicator_values" ("indicatorId", "contextType", "contextId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0579f2ba0be027b0d168e99f5f" ON "indicator_values" ("contextType", "contextId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd8ba1da6f5bbe5cb88b126c5b" ON "indicator_values" ("indicatorId", "contextId") `);
        await queryRunner.query(`CREATE TABLE "indicator_snapshots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "indicatorId" character varying NOT NULL, "contextType" character varying NOT NULL DEFAULT 'group', "contextId" character varying NOT NULL, "activityId" character varying NOT NULL, "title" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6237c0c6c3943a85c68002f0b21" UNIQUE ("indicatorId", "contextType", "contextId", "activityId"), CONSTRAINT "PK_60bb3957f4cfa18030682887e4a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "indicator_notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "indicatorId" character varying NOT NULL, "title" character varying NOT NULL, "message" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_08374248f5bf66a56b636bed232" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "user_indicator_preferences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying(255) NOT NULL, "indicator_id" uuid NOT NULL, "is_visible" boolean NOT NULL DEFAULT true, "displayPreferences" jsonb, "active_viz_id" character varying(255), "enabled_viz_ids" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a33697682fb8292f8d8abe5d74b" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_2170fb2ef9385e8e50c3c46b83" ON "user_indicator_preferences" ("indicator_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_40ae66b7c0d0bc93d91af69372" ON "user_indicator_preferences" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_570f1a3aaa027ace5d57bcce87" ON "user_indicator_preferences" ("user_id", "indicator_id") `);
        await queryRunner.query(`CREATE TABLE "ingestion_cursors" ("stream_name" character varying NOT NULL, "last_id" bigint NOT NULL DEFAULT '0', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ba6213562d03a017d4dceed77ba" PRIMARY KEY ("stream_name"))`);
        await queryRunner.query(`CREATE TABLE "indicator_feedback" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "indicatorId" character varying NOT NULL, "userId" character varying NOT NULL, "rating" integer NOT NULL, "comment" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9bac7e4d47bf8b97b7abce05e53" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "indicator_execution_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "indicatorId" character varying, "userId" character varying, "value" double precision, "durationMs" integer, "error" text, "executedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_47172497117cf81cc8993e1fffc" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a5e0d0755c88a0d37d6928349f" ON "indicator_execution_logs" ("indicatorId", "executedAt") `);
        await queryRunner.query(`ALTER TABLE "indicator_event_rules" ADD CONSTRAINT "FK_eb846039cf056a9663a6c895e35" FOREIGN KEY ("event_type_id") REFERENCES "indicator_event_types"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "indicator_values" ADD CONSTRAINT "FK_4d57dcc8bd0b410481b456cff10" FOREIGN KEY ("indicatorId") REFERENCES "indicator_definitions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_indicator_preferences" ADD CONSTRAINT "FK_2170fb2ef9385e8e50c3c46b83c" FOREIGN KEY ("indicator_id") REFERENCES "indicator_definitions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_indicator_preferences" DROP CONSTRAINT "FK_2170fb2ef9385e8e50c3c46b83c"`);
        await queryRunner.query(`ALTER TABLE "indicator_values" DROP CONSTRAINT "FK_4d57dcc8bd0b410481b456cff10"`);
        await queryRunner.query(`ALTER TABLE "indicator_event_rules" DROP CONSTRAINT "FK_eb846039cf056a9663a6c895e35"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a5e0d0755c88a0d37d6928349f"`);
        await queryRunner.query(`DROP TABLE "indicator_execution_logs"`);
        await queryRunner.query(`DROP TABLE "indicator_feedback"`);
        await queryRunner.query(`DROP TABLE "ingestion_cursors"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_570f1a3aaa027ace5d57bcce87"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_40ae66b7c0d0bc93d91af69372"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2170fb2ef9385e8e50c3c46b83"`);
        await queryRunner.query(`DROP TABLE "user_indicator_preferences"`);
        await queryRunner.query(`DROP TABLE "indicator_notifications"`);
        await queryRunner.query(`DROP TABLE "indicator_snapshots"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dd8ba1da6f5bbe5cb88b126c5b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0579f2ba0be027b0d168e99f5f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9300af983113cf7753d30bc129"`);
        await queryRunner.query(`DROP TABLE "indicator_values"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_61f4c7ff0d29bb9f484fe7e035"`);
        await queryRunner.query(`DROP TABLE "indicator_definitions"`);
        await queryRunner.query(`DROP TABLE "indicator_event_rules"`);
        await queryRunner.query(`DROP TABLE "indicator_event_types"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_600fa67797054594a9e93e9a5b"`);
        await queryRunner.query(`DROP TABLE "indicator_pins"`);
    }

}
