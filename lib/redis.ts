import Redis from 'ioredis';

const getRedisClient = () => {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    return null;
  }

  // Configuración para ioredis
  // Si estamos en entorno de desarrollo, podemos querer logs adicionales o retry strategy específica
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // Importante para entornos serverless/lambda como Vercel para evitar conexiones colgadas
    // aunque ioredis maneja esto bastante bien, a veces es necesario lazy connect.
    lazyConnect: true 
  });

  client.on('error', (err) => {
    console.warn('Redis connection error:', err);
  });

  return client;
};

// Singleton para reusar la instancia en desarrollo (hot reload)
// En producción (serverless) se creará una nueva instancia a menudo.
const globalForRedis = global as unknown as { redis: Redis | null };

export const redis = globalForRedis.redis || getRedisClient();

if (process.env.NODE_ENV !== 'production' && redis) {
  globalForRedis.redis = redis;
}

export const isRedisConfigured = () => {
  return !!process.env.REDIS_URL;
};