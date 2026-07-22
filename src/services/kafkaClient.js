import { readFileSync } from 'node:fs';
import { Kafka, logLevel } from 'kafkajs';
import { env } from '../config/env.js';

function buildSslOption() {
  if (!env.kafka.ssl) return undefined;
  // A hosted broker with a private/self-signed CA needs its cert explicitly trusted;
  // one on a publicly trusted CA can just use `ssl: true` and the platform's trust store.
  if (env.kafka.sslCa) return { ca: [env.kafka.sslCa] };
  if (env.kafka.sslCaPath) return { ca: [readFileSync(env.kafka.sslCaPath, 'utf-8')] };
  return true;
}

/**
 * Shared Kafka client builder for both the producer (kafkaProducer.js) and the
 * consumer (kafkaConsumer.js) — same broker list, same SSL/SASL config, so the two
 * never drift out of sync with each other.
 */
export function createKafkaClient() {
  return new Kafka({
    clientId: env.kafka.clientId,
    brokers: env.kafka.brokers,
    logLevel: logLevel.ERROR,
    ssl: buildSslOption(),
    sasl: env.kafka.sasl || undefined,
    // kafkajs defaults connectionTimeout to 1000ms, which is too tight for a full
    // SSL+SASL handshake to a remote hosted broker (Aiven) — easily exceeded from
    // behind Docker's NAT — and was causing spurious "Connection timeout" errors.
    connectionTimeout: 10000,
    requestTimeout: 10000,
    retry: { retries: 2, initialRetryTime: 300, maxRetryTime: 2000 }
  });
}
