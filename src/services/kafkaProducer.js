import { readFileSync } from 'node:fs';
import { Kafka, logLevel } from 'kafkajs';
import { env } from '../config/env.js';

let producerPromise = null;

function buildSslOption() {
  if (!env.kafka.ssl) return undefined;
  // A hosted broker with a private/self-signed CA needs its cert explicitly trusted;
  // one on a publicly trusted CA can just use `ssl: true` and the platform's trust store.
  if (env.kafka.sslCa) return { ca: [env.kafka.sslCa] };
  if (env.kafka.sslCaPath) return { ca: [readFileSync(env.kafka.sslCaPath, 'utf-8')] };
  return true;
}

function connectProducer() {
  const kafka = new Kafka({
    clientId: env.kafka.clientId,
    brokers: env.kafka.brokers,
    logLevel: logLevel.ERROR,
    ssl: buildSslOption(),
    sasl: env.kafka.sasl || undefined,
    // kafkajs defaults connectionTimeout to 1000ms, which is too tight for a full
    // SSL+SASL handshake to a remote hosted broker (Aiven) — easily exceeded from
    // behind Docker's NAT — and was causing spurious "Connection timeout" errors.
    connectionTimeout: 10000,
    // Fail fast rather than kafkajs's default multi-minute retry/backoff — a stuck
    // publish would otherwise stall the Lighthouse worker loop behind it (see
    // processNext(), which intentionally doesn't await publishing, but a bounded
    // send() still keeps a single broker outage from piling up in-flight retries).
    requestTimeout: 10000,
    retry: { retries: 2, initialRetryTime: 300, maxRetryTime: 2000 }
  });
  const producer = kafka.producer();
  return producer.connect().then(() => producer);
}

function getProducer() {
  if (!env.kafka.brokers.length) return null;
  if (!producerPromise) {
    // Cache the connect promise (not just the producer) so concurrent callers
    // during startup all await the same in-flight connection instead of racing.
    producerPromise = connectProducer().catch((err) => {
      producerPromise = null;
      throw err;
    });
  }
  return producerPromise;
}

/**
 * Publishes an event to the configured Lighthouse Kafka topic, keyed by job id
 * so all events for the same job land on the same partition (ordering).
 * Returns false without throwing when KAFKA_BROKERS isn't configured, so
 * local/dev environments without a broker keep working.
 */
export async function publishLighthouseEvent(key, payload) {
  const producer = getProducer();
  if (!producer) {
    console.warn('[kafka] KAFKA_BROKERS not configured, skipping event publish');
    return false;
  }

  const client = await producer;
  console.log('Kafka publish: ', payload)
  await client.send({
    topic: env.kafka.lighthouseTopic,
    messages: [{ key, value: JSON.stringify(payload) }]
  });
  return true;
}

export async function disconnectKafkaProducer() {
  if (!producerPromise) return;
  const client = await producerPromise.catch(() => null);
  producerPromise = null;
  if (client) await client.disconnect();
}
