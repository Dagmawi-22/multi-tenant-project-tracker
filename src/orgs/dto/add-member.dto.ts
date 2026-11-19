import { IsEmail, IsIn } from 'class-validator';
import { MembershipRole } from '../../entities';

export class AddMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'member'])
  role!: MembershipRole;
}
