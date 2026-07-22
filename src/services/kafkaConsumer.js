import { env } from '../config/env.js';
import { createKafkaClient } from './kafkaClient.js';

let consumer = null;

function handleMessage({ message }) {
  const key = message.key?.toString();
  let payload;
  try {
    payload = JSON.parse(message.value.toString());
  } catch {
    console.warn(`[kafka-consumer] received non-JSON message (key=${key}), skipping`);
    return;
  }

  console.log(`[kafka-consumer] event received (key=${key}):`, payload);
}

/**
 * Subscribes to the same topic kafkaProducer.js publishes Lighthouse audit events to,
 * and logs each one to the console. Reuses createKafkaClient() so it always agrees with
 * the producer on brokers/SSL/SASL. No-ops when KAFKA_BROKERS isn't configured, same as
 * the producer, so local/dev environments without a broker keep working.
 */
export async function startLighthouseEventConsumer() {
  if (!env.kafka.brokers.length) {
    console.warn('[kafka-consumer] KAFKA_BROKERS not configured, consumer not started');
    return;
  }

  consumer = createKafkaClient().consumer({ groupId: env.kafka.consumerGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: env.kafka.lighthouseTopic, fromBeginning: false });

  await consumer.run({ eachMessage: handleMessage });
  console.log(
    `[kafka-consumer] listening on topic "${env.kafka.lighthouseTopic}" (group "${env.kafka.consumerGroupId}")`
  );
}

export async function disconnectKafkaConsumer() {
  if (!consumer) return;
  const client = consumer;
  consumer = null;
  await client.disconnect();
}
