import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { NexaraError, ErrorCodes } from '../../common/errors/nexara-error';
import { mapFineractError } from './fineract.mapper';

@Injectable()
export class FineractClient {
  private readonly logger = new Logger(FineractClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const started = Date.now();
    try {
      const response = await firstValueFrom(
        this.http.request<T>({
          method,
          url: path,
          data: body,
        }),
      );
      this.logger.log(
        `Fineract ${method} ${path} status=${response.status} durationMs=${Date.now() - started}`,
      );
      return response.data;
    } catch (error) {
      const durationMs = Date.now() - started;
      if (error instanceof AxiosError) {
        const status = error.response?.status ?? 0;
        this.logger.warn(
          `Fineract ${method} ${path} status=${status} durationMs=${durationMs}`,
        );
        throw mapFineractError(
          status,
          error.response?.data,
          error.message || 'Fineract request failed',
        );
      }
      this.logger.error(
        `Fineract ${method} ${path} failed durationMs=${durationMs}`,
      );
      throw new NexaraError(
        ErrorCodes.FINERACT_UNAVAILABLE,
        'Fineract is unavailable',
        502,
      );
    }
  }
}
