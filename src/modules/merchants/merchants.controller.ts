import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { UsersService } from '../auth/users.service';
import {
  CreateMerchantDto,
  OnboardingExtrasDto,
  SuspendMerchantDto,
  UpdateMerchantDto,
  VerifyAadhaarDto,
  VerifyPanDto,
} from './dto/merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('ops/merchants')
@Roles(UserRole.ADMIN, UserRole.OPS)
@ApiTags('Ops — Merchants')
@ApiBearerAuth('JWT')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly users: UsersService,
  ) {}

  @Post()
  create(@Body() body: CreateMerchantDto) {
    return this.merchants.create(body);
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.merchants.list({ status, search });
  }

  @Get('network')
  network() {
    return this.merchants.network();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.merchants.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMerchantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.merchants.update(id, body, user.email);
  }

  @Post(':id/kyc/aadhaar')
  verifyAadhaar(@Param('id') id: string, @Body() body: VerifyAadhaarDto) {
    return this.merchants.verifyAadhaar(id, body.aadhaarNumber);
  }

  @Post(':id/kyc/pan')
  verifyPan(@Param('id') id: string, @Body() body: VerifyPanDto) {
    return this.merchants.verifyPan(id, body.pan, body.name);
  }

  @Post(':id/kyc/documents')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        aadhaarFront: { type: 'string', format: 'binary' },
        aadhaarBack: { type: 'string', format: 'binary' },
        pan: { type: 'string', format: 'binary' },
        selfie: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'aadhaarFront', maxCount: 1 },
        { name: 'aadhaarBack', maxCount: 1 },
        { name: 'pan', maxCount: 1 },
        { name: 'selfie', maxCount: 1 },
      ],
      { storage: memoryStorage() },
    ),
  )
  uploadDocuments(
    @Param('id') id: string,
    @UploadedFiles()
    files: {
      aadhaarFront?: Express.Multer.File[];
      aadhaarBack?: Express.Multer.File[];
      pan?: Express.Multer.File[];
      selfie?: Express.Multer.File[];
    },
  ) {
    return this.merchants.storeKycFiles(id, {
      aadhaarFront: files?.aadhaarFront?.[0],
      aadhaarBack: files?.aadhaarBack?.[0],
      pan: files?.pan?.[0],
      selfie: files?.selfie?.[0],
    });
  }

  @Post(':id/kyc/onboarding')
  onboarding(@Param('id') id: string, @Body() body: OnboardingExtrasDto) {
    return this.merchants.saveOnboardingExtras(id, body);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.merchants.activate(id);
  }

  @Post(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Body() body: SuspendMerchantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.merchants.suspend(id, body.reason, user.email);
  }

  @Post(':id/mpin/reset')
  @ApiOperation({
    summary: 'Clear merchant transaction PIN (ops)',
    description:
      'Removes the stored MPIN so the merchant must set a new one via OTP reset or POST /me/mpin.',
  })
  resetMpin(@Param('id') id: string) {
    return this.users.clearMpinForMerchant(id);
  }

  @Get(':id/kyc/presigned-urls')
  kycPresignedUrls(@Param('id') id: string) {
    return this.merchants.getKycPresignedUrls(id);
  }
}
