import { Transform } from 'class-transformer';
import { IsNumberString, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SaveProjectDto {
  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(({ value }) => (value === '' || value === undefined || value === null ? '0' : String(value)))
  @IsNumberString({ no_symbols: false })
  budgetEtb!: string;
}
