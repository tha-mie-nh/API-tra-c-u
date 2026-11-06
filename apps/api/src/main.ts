import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { PinoLoggerService } from './common/logging/pino-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // tạo ứng dụng nestjs cài các thiết lập http, cookie, cors, logger, global prefix và filter
  // khởi tạo từ các module và service đã được định nghĩa trong AppModule
  // Phase 09 hardening: structured JSON logs to stdout instead of Nest's
  // default text logger (see PinoLoggerService for why this is a drop-in
  // swap — every existing `new Logger(ctx)` call elsewhere is unaffected).
  // Instantiated directly (no constructor deps) — no need to register it in
  // AppModule's providers just to satisfy DI for this one bootstrap call.
  app.useLogger(new PinoLoggerService());
  app.setGlobalPrefix('api/v1');
  // SwaggerModule.setup() mounts at the EXACT path given — NOT affected by
  // setGlobalPrefix above, so the 'api/v1/' here is written out by hand, not
  // inherited. Must stay under that prefix: in prod, nginx only reverse-proxies
  // /api/v1/* to this container (see docker/nginx.conf) — a path outside that
  // prefix would 404 through the real deployed proxy even though it works
  // fine when hitting this container directly in dev.
  const swaggerDocument = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('APP Tra cứu dữ liệu — API')
      .setDescription('Nội bộ, không public. Bearer token lấy từ POST /api/v1/auth/login.')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build(),
  );
  SwaggerModule.setup('api/v1/docs', app, swaggerDocument);
  // Security headers (HSTS, X-Content-Type-Options, X-Frame-Options, etc.).
  // CSP is left to the edge reverse proxy (docker/Caddyfile) which serves the
  // actual HTML document; the API only ever returns JSON.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
    //helmet thêm các header bảo mật vào response HTTP, ví dụ như HSTS, X-Content-Type-Options, X-Frame-Options, v.v. Tuy nhiên, CSP (Content Security Policy) được tắt ở đây vì nó sẽ được xử lý bởi reverse proxy (Caddyfile) phục vụ tài liệu HTML thực tế; API chỉ trả về JSON.
  );
  // Required to read the httpOnly refresh-token cookie (auth/cookie.util.ts).
  app.use(cookieParser());
  // Cookie-based refresh flow needs credentials:true + an explicit origin
  // allow-list (never '*') — see phase-03 Security Considerations.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    credentials: true,
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  //bọc thêm try catch để log lỗi nếu có lỗi xảy ra trong quá trình khởi tạo ứng dụng
}
bootstrap();
