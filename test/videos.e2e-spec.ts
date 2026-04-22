import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ExternalVideoApiService } from '../src/video-generation/external-video-api.service';

describe('Videos (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ExternalVideoApiService)
      .useValue({
        generateVideo: async () => ({ videoUrl: 'https://cdn.example.com/e2e-video.mp4' }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function signupAndGetToken(): Promise<string> {
    const email = `video-user-${Date.now()}-${Math.random()}@demo.com`;
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ email, password: 'Demo1234!' })
      .expect(201);

    return res.body.accessToken;
  }

  it('POST /api/videos/generate with auth returns 201', async () => {
    const token = await signupAndGetToken();

    const templates = await request(app.getHttpServer()).get('/api/templates').expect(200);
    const templateId = templates.body[0].id;

    await request(app.getHttpServer())
      .post('/api/videos/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({
        productTitle: 'E2E Product',
        productDescription: 'E2E product description',
        productImageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30',
        templateId,
      })
      .expect(201);
  });

  it('POST /api/videos/generate without auth returns 401', async () => {
    const templates = await request(app.getHttpServer()).get('/api/templates').expect(200);
    const templateId = templates.body[0].id;

    await request(app.getHttpServer())
      .post('/api/videos/generate')
      .send({
        productTitle: 'Unauthorized Product',
        productDescription: 'Should fail',
        productImageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
        templateId,
      })
      .expect(401);
  });

  it('GET /api/videos returns paginated list', async () => {
    const token = await signupAndGetToken();

    const res = await request(app.getHttpServer())
      .get('/api/videos')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.total).toBe('number');
  });
});
