import { env } from '../config/env.js';
import { createKafkaClient } from './kafkaClient.js';

let producerPromise = null;

function connectProducer() {
  // Fail fast rather than kafkajs's default multi-minute retry/backoff — a stuck
  // publish would otherwise stall the Lighthouse worker loop behind it (see
  // processNext(), which intentionally doesn't await publishing, but a bounded
  // send() still keeps a single broker outage from piling up in-flight retries).
  const producer = createKafkaClient().producer();
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
