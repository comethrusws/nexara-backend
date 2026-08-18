import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    const checks = { postgres: false };

    try {
      await this.dataSource.query('SELECT 1');
      checks.postgres = true;
    } catch {
      checks.postgres = false;
    }

    return {
      status: checks.postgres ? 'ok' : 'degraded',
      checks,
    };
  }
}
