import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Tiers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/tiers returns all tiers', async () => {
    const res = await request(app.getHttpServer()).get('/api/tiers').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });

  it('GET /api/tiers/:id returns a tier', async () => {
    const list = await request(app.getHttpServer()).get('/api/tiers').expect(200);
    const tierId = list.body[0].id;

    const res = await request(app.getHttpServer()).get(`/api/tiers/${tierId}`).expect(200);
    expect(res.body.id).toBe(tierId);
  });
});
