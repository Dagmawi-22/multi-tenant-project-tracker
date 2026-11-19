import { Transform } from 'class-transformer';
import { IsIn, IsNumberString, IsOptional, IsString, Length } from 'class-validator';
import { TaskStatus } from '../../entities';

export class SaveTaskDto {
  @IsString()
  @Length(2, 200)
  title!: string;

  @IsOptional()
  @IsIn(['todo', 'in_progress', 'done'])
  status?: TaskStatus;

  @Transform(({ value }) => (value === '' || value === undefined || value === null ? '0' : String(value)))
  @IsNumberString({ no_symbols: false })
  estimatedCostEtb!: string;
}
