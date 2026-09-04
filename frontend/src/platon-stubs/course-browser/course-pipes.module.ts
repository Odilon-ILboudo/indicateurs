import { NgModule } from '@angular/core'
import { DisplayCourseMemberRolePipe } from './course-member-role.pipe'

@NgModule({ imports: [DisplayCourseMemberRolePipe], exports: [DisplayCourseMemberRolePipe] })
export class CoursePipesModule {}
