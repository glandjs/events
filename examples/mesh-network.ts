import { EventBroker } from '../src';

interface BrokerEvents {
  'message:new': string;
}
const broker1 = new EventBroker<BrokerEvents>({ name: 'broker-1' });
const broker2 = new EventBroker<BrokerEvents>({ name: 'broker-2' });
const broker3 = new EventBroker<BrokerEvents>({ name: 'broker-3' });
const broker4 = new EventBroker<BrokerEvents>({ name: 'broker-4' });
const broker5 = new EventBroker<BrokerEvents>({ name: 'broker-5' });
const broker6 = new EventBroker<BrokerEvents>({ name: 'broker-6' });
const allBrokers = [broker2, broker3, broker4, broker5, broker6];
broker1.createConnections(allBrokers);

console.log('Mesh network established');

broker1.on('message:new', (message) => {
  console.log(`[${broker1.id}] Received message: ${message}`);
});

broker2.on('message:new', (message) => {
  console.log(`[${broker2.id}] Received message: ${message}`);
});

broker3.on('message:new', (message) => {
  console.log(`[${broker3.id}] Received message: ${message}`);
});

broker4.on('message:new', (message) => {
  console.log(`[${broker4.id}] Received message: ${message}`);
});

broker5.on('message:new', (message) => {
  console.log(`[${broker5.id}] Received message: ${message}`);
});

broker6.on('message:new', (message) => {
  console.log(`[${broker6.id}] Received message: ${message}`);
});
broker4.broadcast('message:new', 'Hello from Broker 4 to the entire mesh network!');
console.log(`\nSending direct message from ${broker2.id} to ${broker5.id}...`);
broker2.emitTo(broker5.id, 'message:new', 'This is a direct message from Broker 2 to Broker 5 only');
