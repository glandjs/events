import { EventBroker } from '../dist';

interface AppEvents {
  'user:login': { id: string; username: string };
  'notification:new': { id: string; message: string };
  'data:loaded': { source: string; items: any[] };
}

// =====================================================
// Example 1: Basic event subscription and emission
// =====================================================
console.log('===== Example 1: Basic event handling =====');

const events = new EventBroker<AppEvents>({ name: 'broker' });
events.on('user:login', (data) => {
  console.log(`User logged in: ${data.username} (${data.id})`);
});

events.emit('user:login', { id: 'user123', username: 'john_doe' });

// =====================================================
// Example 2: Event once handling
// =====================================================
console.log('===== Example 2: Once event handling =====');
events.once('user:login', (data) => {
  console.log(`User logged in once: ${data.username} (${data.id})`);
});

events.emit('user:login', { id: 'user456', username: 'jane_doe' });
events.emit('user:login', { id: 'user789', username: 'jack_doe' });

// =====================================================
// Example 3: Get listener for an event
// =====================================================
console.log('===== Example 3: Get listener =====');
const listeners = events.getListener('user:login');
console.log(`Listeners for 'user:login':`, listeners);
