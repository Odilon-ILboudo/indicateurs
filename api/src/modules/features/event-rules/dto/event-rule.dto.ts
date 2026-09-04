// DTOs de validation runtime pour create/update de règle événementielle.
import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString, IsNotEmpty, IsOptional, IsIn, ValidateNested, ValidateIf, IsNumber, MaxLength,
} from 'class-validator';
import { EventRuleOperation, EventRuleConditionKind } from '../indicator-event-rule.entity';

const VALID_OPERATIONS: EventRuleOperation[] = ['INSERT', 'UPDATE', 'INSERT_OR_UPDATE'];
const VALID_CONDITION_KINDS: EventRuleConditionKind[] = ['always', 'changed', 'equals', 'not_equals', 'threshold_crossed'];
const VALID_OPERATORS = ['>', '>=', '<', '<='] as const;

export class NewEventTypeDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsString() @IsNotEmpty() @MaxLength(120) label: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class EventRuleConditionDto {
  @IsIn(VALID_CONDITION_KINDS) kind: EventRuleConditionKind;

  @ValidateIf(o => o.kind === 'equals' || o.kind === 'not_equals')
  @IsNotEmpty({ message: 'condition.value est requis pour "equals" / "not_equals"' })
  value?: string | number | boolean | null;

  @ValidateIf(o => o.kind === 'threshold_crossed')
  @IsIn(VALID_OPERATORS, { message: 'condition.operator est requis (">", ">=", "<" ou "<=") pour "threshold_crossed"' })
  operator?: '>' | '>=' | '<' | '<=';

  @ValidateIf(o => o.kind === 'threshold_crossed')
  @IsNumber({}, { message: 'condition.threshold est requis et doit être un nombre pour "threshold_crossed"' })
  threshold?: number;
}

export class EventRuleContextMappingDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsOptional() @IsString() courseId?: string;
  @IsOptional() @IsString() activityId?: string;
  @IsOptional() @IsString() sessionId?: string;
}

/* `eventTypeId` XOR `newEventType` : la règle métier (l'un des deux requis) reste vérifiée dans
 EventRulesService.create().
*/
export class CreateEventRuleDto {
  @IsOptional() @IsString() eventTypeId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewEventTypeDto)
  newEventType?: NewEventTypeDto;

  @IsString() @IsNotEmpty() sourceTable: string;

  @IsOptional() @IsString() watchedColumn?: string | null;

  @IsIn(VALID_OPERATIONS) operation: EventRuleOperation;

  @ValidateNested()
  @Type(() => EventRuleConditionDto)
  condition: EventRuleConditionDto;

  @ValidateNested()
  @Type(() => EventRuleContextMappingDto)
  contextMapping: EventRuleContextMappingDto;
}

export class UpdateEventRuleDto extends PartialType(CreateEventRuleDto) {}
