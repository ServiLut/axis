import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.tecnicos.prisma',
  datasource: {
    url: env('DATABASE_URL_MYSQL_TECNICOS'),
  },
});
