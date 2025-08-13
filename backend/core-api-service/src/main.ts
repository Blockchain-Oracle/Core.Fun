import dotenv from 'dotenv';
import { Server } from './server';

// Load environment variables
dotenv.config();

// Start server
async function main() {
  const port = parseInt(process.env.PORT || '3000');
  const server = new Server(port);
  
  try {
    await server.start();
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();