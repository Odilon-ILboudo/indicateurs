// src/modules/features/courses/dto/course-member.dto.ts
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

const VALID_ROLES = ['student', 'teacher'];

export class CreateCourseMemberDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsIn(VALID_ROLES) role: string;
}

export class UpdateCourseMemberRoleDto {
  @IsIn(VALID_ROLES) role: string;
}
