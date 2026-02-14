import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OrgContextGuard } from '../../tenancy/org-context.guard';
import { OrgId } from '../../tenancy/org-context.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/current-user.decorator';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { AssignTaskDto } from './dto/assign-task.dto';

@Controller('crm')
@UseGuards(JwtAuthGuard, OrgContextGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  // POST /api/crm/leads/:leadId/tasks
  @Post('leads/:leadId/tasks')
  async create(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('leadId', ParseUUIDPipe) leadId: string,
    @Body() dto: CreateTaskDto,
  ) {
    const role = await this.tasksService.getUserRole(orgId, user.userId);
    return this.tasksService.create(orgId, leadId, dto, user.userId, role);
  }

  // GET /api/crm/tasks
  @Get('tasks')
  async findAll(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ListTasksDto,
  ) {
    const role = await this.tasksService.getUserRole(orgId, user.userId);
    return this.tasksService.findAll(orgId, user.userId, role, {
      scope: query.scope,
      status: query.status,
      priority: query.priority,
      overdue: query.overdue,
      due: query.due,
      q: query.q,
      limit: query.limit ? Number(query.limit) : undefined,
      cursor: query.cursor,
    });
  }

  // GET /api/crm/tasks/:id
  @Get('tasks/:id')
  async findOne(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.tasksService.getUserRole(orgId, user.userId);
    return this.tasksService.findOne(orgId, id, user.userId, role);
  }

  // PATCH /api/crm/tasks/:id
  @Patch('tasks/:id')
  async update(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const role = await this.tasksService.getUserRole(orgId, user.userId);
    return this.tasksService.update(orgId, id, dto, user.userId, role);
  }

  // POST /api/crm/tasks/:id/assign
  @Post('tasks/:id/assign')
  @HttpCode(200)
  async assign(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
  ) {
    const role = await this.tasksService.getUserRole(orgId, user.userId);
    return this.tasksService.assign(orgId, id, dto, user.userId, role);
  }

  // DELETE /api/crm/tasks/:id
  @Delete('tasks/:id')
  async remove(
    @OrgId() orgId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const role = await this.tasksService.getUserRole(orgId, user.userId);
    return this.tasksService.remove(orgId, id, user.userId, role);
  }
}
