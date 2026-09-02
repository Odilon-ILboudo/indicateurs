// DTOs de validation runtime pour create/update d'indicateur.
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean, IsArray, IsNumber,
  IsObject, ValidateNested, MaxLength, ValidatorConstraint, ValidatorConstraintInterface,
  Validate, ValidationArguments,
} from 'class-validator';
import { ContextType, VizType } from '../entities/indicator-definition.entity';

export const VALID_CONTEXT_TYPES = ['learner', 'teacher', 'admin', 'course', 'activity', 'group'] as const;
export const VALID_VIZ_TYPES = ['card', 'gauge', 'line-chart', 'bar-chart', 'histogram'] as const;
const VALID_STEP_TYPES = ['fetch', 'join', 'filter', 'groupBy', 'findFirst', 'extract', 'aggregate', 'round', 'divide', 'js'];

/** Ordre attendu par indicator-card.component.ts#statusColor : val<=good -> vert,
 *  val<=warning -> orange, sinon rouge. `critical` reste une borne documentaire
 *  (voir indicator-definition.entity.ts) mais doit rester cohérente si fournie. */
@ValidatorConstraint({ name: 'thresholdsOrder', async: false })
class ThresholdsOrderConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const { good, warning, critical } = args.object as ThresholdsDto;
    if (good != null && warning != null && good > warning) return false;
    if (warning != null && critical != null && warning > critical) return false;
    if (good != null && critical != null && warning == null && good > critical) return false;
    return true;
  }
  defaultMessage(): string {
    return 'Les seuils doivent respecter good <= warning <= critical';
  }
}

/* @Validate est répété sur les 3 champs (et non un seul) car @IsOptional() n'exécute les
 * validateurs d'un champ que si CE champ est renseigné : il faut donc accrocher le contrôle
 * croisé à chacun pour qu'il se déclenche quelle que soit la combinaison de champs fournis. */
export class ThresholdsDto {
  @IsOptional() @IsNumber() @Validate(ThresholdsOrderConstraint) good?: number;
  @IsOptional() @IsNumber() @Validate(ThresholdsOrderConstraint) warning?: number;
  @IsOptional() @IsNumber() @Validate(ThresholdsOrderConstraint) critical?: number;
}

export class VisualizationDto {
  @IsString() @IsNotEmpty() id: string;
  @IsString() @IsNotEmpty() @MaxLength(120) label: string;
  @IsIn(VALID_VIZ_TYPES) type: VizType;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() @MaxLength(40) unit?: string;
}

/** Validation large sur `params` : la validation fine par type est déjà faite côté frontend,
 *  le backend ne fait qu'une vérification de forme minimale. */
export class FormulaStepDto {
  @IsString() @IsNotEmpty() id: string;
  @IsIn(VALID_STEP_TYPES) type: string;
  @IsOptional() @IsString() label?: string;
  @IsObject() params: Record<string, any>;
}

export class FormulaDto {
  @IsIn(['1.0']) version: '1.0';
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormulaStepDto)
  pipeline: FormulaStepDto[];
}

export class CreateIndicatorDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;

  @IsOptional() @IsString() @MaxLength(2000) description?: string;

  /** Optionnel : les placeholders de famille vide sont créés sans contexte
   *  (voir admin-indicator-manager.component.ts#createEmptyFamily). */
  @IsOptional() @IsIn(VALID_CONTEXT_TYPES) contextType?: ContextType;

  @IsOptional() @IsString() @MaxLength(255) familyName?: string | null;

  @IsOptional() @IsString() baseIndicatorId?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true }) requiredEvents?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisualizationDto)
  visualizations?: VisualizationDto[];

  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isComplete?: boolean;
  @IsOptional() @IsBoolean() isFamilyPlaceholder?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => FormulaDto)
  formula?: FormulaDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => ThresholdsDto)
  thresholds?: ThresholdsDto | null;

  @IsOptional() @IsString() @MaxLength(2000) interpretationHint?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true }) visibilityRoles?: string[] | null;
}

export class UpdateIndicatorDto extends PartialType(CreateIndicatorDto) {}

export class UpdateIndicatorStatusDto {
  @IsBoolean() isActive: boolean;
}
