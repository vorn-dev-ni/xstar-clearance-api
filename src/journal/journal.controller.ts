import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { ListJournalEntriesDto } from './dto/list-journal-entries.dto';
import { JournalService } from './journal.service';

@ApiTags('journal-entries')
@ApiBearerAuth()
@Controller('journal-entries')
export class JournalController {
  constructor(private readonly journal: JournalService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: AuthUser) {
    return this.journal.createEntry(dto, user.userId);
  }

  @Get()
  findAll(@Query() query: ListJournalEntriesDto) {
    return this.journal.findAll(query);
  }
}
