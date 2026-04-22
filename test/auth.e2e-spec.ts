import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
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

  it('POST /api/auth/signup returns token', async () => {
    const email = `auth-signup-${Date.now()}@demo.com`;
    const response = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password: 'Demo1234!',
        firstName: 'Auth',
        lastName: 'Tester',
      })
      .expect(201);

    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.email).toBe(email);
  });

  it('POST /api/auth/signup duplicate email returns 409', async () => {
    const email = `auth-duplicate-${Date.now()}@demo.com`;

    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password: 'Demo1234!',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password: 'Demo1234!',
      })
      .expect(409);
  });

  it('POST /api/auth/login valid returns token', async () => {
    const email = `auth-login-${Date.now()}@demo.com`;

    await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password: 'Demo1234!',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email,
        password: 'Demo1234!',
      })
      .expect(200);

    expect(response.body.accessToken).toBeDefined();
  });

  it('POST /api/auth/login invalid returns 401', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: `invalid-${Date.now()}@demo.com`,
        password: 'wrong-pass',
      })
      .expect(401);
  });

  it('GET /api/auth/profile with token returns user', async () => {
    const email = `auth-profile-${Date.now()}@demo.com`;

    const signup = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({
        email,
        password: 'Demo1234!',
      })
      .expect(201);

    const token = signup.body.accessToken;

    const profile = await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(profile.body.email).toBe(email);
  });

  it('GET /api/auth/profile without token returns 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/profile').expect(401);
  });
});
