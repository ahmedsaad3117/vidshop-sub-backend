import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getRoot() {
    return { message: 'VidShop backend is running' };
  }
}
