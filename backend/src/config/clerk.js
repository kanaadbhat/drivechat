import { Clerk } from '@clerk/clerk-sdk-node';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error('CLERK_SECRET_KEY is required');
}

// Initialize Clerk SDK
const clerk = new Clerk({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export default clerk;
