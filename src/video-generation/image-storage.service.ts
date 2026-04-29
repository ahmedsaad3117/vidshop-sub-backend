import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly uploadsDir: string;
  private readonly allowedMimeTypes = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);
  private readonly maxFileSizeBytes = 10 * 1024 * 1024;

  constructor(private readonly configService: ConfigService) {
    this.uploadsDir = join(process.cwd(), 'uploads', 'images');

    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }

    this.logger.log(`Uploads directory ready: ${this.uploadsDir}`);
  }

  saveUploadedFile(file: Express.Multer.File): string {
    this.validateUploadedFile(file);

    const extension = extname(file.originalname) || this.getExtensionFromMimeType(file.mimetype);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
    const filePath = join(this.uploadsDir, fileName);

    writeFileSync(filePath, file.buffer);

    const baseUrl = this.configService.get<string>('API_URL') || `http://localhost:${this.configService.get<string>('PORT', '3001')}`;
    return `${baseUrl}/uploads/images/${fileName}`;
  }

  toDataUri(file: Express.Multer.File): string {
    this.validateUploadedFile(file);
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  }

  isValidUrl(value?: string): boolean {
    if (!value) {
      return false;
    }

    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  isValidRunwayUrl(value?: string): boolean {
    if (!value) {
      return false;
    }

    if (value.startsWith('data:image/') || value.startsWith('runway://')) {
      return true;
    }

    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private validateUploadedFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    if (!this.allowedMimeTypes.has(file.mimetype)) {
      throw new BadRequestException('Unsupported image type. Use jpg, png, webp, or gif');
    }

    if (file.size > this.maxFileSizeBytes) {
      throw new BadRequestException('Image file is too large. Maximum size is 10MB');
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
      case 'image/jpg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      default:
        return '';
    }
  }
}