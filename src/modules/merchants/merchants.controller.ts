import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
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
import type { Response } from 'express';
import { UserRole } from '../auth/auth.constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.constants';
import { UsersService } from '../auth/users.service';
import {
  CreateMerchantDto,
  OnboardingExtrasDto,
  RejectKycDto,
  SuspendMerchantDto,
  UpdateMerchantDto,
  VerifyAadhaarDto,
  VerifyPanDto,
} from './dto/merchant.dto';
import { MerchantsService } from './merchants.service';

@Controller('ops/merchants')
@Roles(
  UserRole.ADMIN,
  UserRole.OPS,
  UserRole.SUPER_DISTRIBUTOR,
  UserRole.DISTRIBUTOR,
)
@ApiTags('Ops — Merchants')
@ApiBearerAuth('JWT')
export class MerchantsController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly users: UsersService,
  ) {}

  @Post()
  create(@Body() body: CreateMerchantDto, @CurrentUser() user: AuthUser) {
    return this.merchants.create(body, user);
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.merchants.list({ status, search }, user);
  }

  @Get('network')
  network(@CurrentUser() user?: AuthUser) {
    return this.merchants.network(user);
  }

  @Get('kyc-verifications')
  @Roles(UserRole.ADMIN, UserRole.OPS)
  @ApiOperation({ summary: 'List merchants for KYC review queue' })
  listKycVerifications(
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.merchants.listKycVerifications({ status, search });
  }

  @Get('kyc-verifications/:id')
  @Roles(UserRole.ADMIN, UserRole.OPS)
  @ApiOperation({ summary: 'Get KYC verification detail with document URLs' })
  getKycVerification(@Param('id') id: string) {
    return this.merchants.getKycVerification(id);
  }

  @Get('kyc/file')
  @Roles(UserRole.ADMIN, UserRole.OPS)
  @ApiOperation({ summary: 'Stream a stored KYC document' })
  async streamKycFile(
    @Query('path') path: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.merchants.streamKycFile(path ?? '');
    res.set({
      'Content-Type': file.contentType,
      'Content-Length': String(file.body.length),
      'Cache-Control': 'private, max-age=3600',
    });
    return new StreamableFile(file.body);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.merchants.get(id, user);
  }

  @Get(':id/kyc/presigned-urls')
  kycPresignedUrls(@Param('id') id: string) {
    return this.merchants.getKycPresignedUrls(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateMerchantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.merchants.update(id, body, user.email, user);
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
        signedAgreement: { type: 'string', format: 'binary' },
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
        { name: 'signedAgreement', maxCount: 1 },
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
      signedAgreement?: Express.Multer.File[];
    },
  ) {
    return this.merchants.storeKycFiles(id, {
      aadhaarFront: files?.aadhaarFront?.[0],
      aadhaarBack: files?.aadhaarBack?.[0],
      pan: files?.pan?.[0],
      selfie: files?.selfie?.[0],
      signedAgreement: files?.signedAgreement?.[0],
    });
  }

  @Post(':id/kyc/onboarding')
  onboarding(@Param('id') id: string, @Body() body: OnboardingExtrasDto) {
    return this.merchants.saveOnboardingExtras(id, body);
  }

  @Post(':id/kyc/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Approve KYC and activate merchant' })
  approveKyc(@Param('id') id: string) {
    return this.merchants.approveKyc(id);
  }

  @Post(':id/kyc/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reject a KYC application' })
  rejectKyc(
    @Param('id') id: string,
    @Body() body: RejectKycDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.merchants.rejectKyc(id, body.reason, user.email);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.merchants.activate(id, user);
  }

  @Post(':id/suspend')
  suspend(
    @Param('id') id: string,
    @Body() body: SuspendMerchantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.merchants.suspend(id, body.reason, user.email, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a sub-entity or merchant from network' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.merchants.deleteMerchant(id, user.email, user);
  }

  @Post(':id/mpin/reset')
  @Roles(UserRole.ADMIN, UserRole.OPS)
  @ApiOperation({
    summary: 'Clear merchant transaction PIN (ops)',
    description:
      'Removes the stored MPIN so the merchant must set a new one via OTP reset or POST /me/mpin.',
  })
  resetMpin(@Param('id') id: string) {
    return this.users.clearMpinForMerchant(id);
  }
}
