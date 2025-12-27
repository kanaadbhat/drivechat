# DriveChat

The private, encrypted workspace for chatting with yourself.

DriveChat is a self-hosted, cross-platform space to sync notes, links, and files between your devices—without the noise of social media or the privacy risks of cloud storage. Think of it as a digital dumping ground that you control completely.

---

## 🧠 Why I Built This

We’ve all done it—texting the “Me” chat on WhatsApp or Telegram just to send a link to our laptop. But it’s inconvenient, clutters your main chat history, and forces you to share a phone number.

I kept running into these friction points:

- Cross-Device Chaos  
  Moving a file from phone to laptop shouldn’t require uploading it to a third-party server or scrolling through a chat thread.

- The “Me” Chat Problem  
  Messaging apps aren’t designed for personal data persistence or long-term organization.

- True Privacy  
  I don’t want AI indexing my personal notes or files, and I don’t want my data tied to a phone number.

DriveChat fixes this by treating your Google Drive as the authoritative file store and using Firestore for real-time sync. The server never sees your files—they’re encrypted and uploaded directly from your device to your Drive.

---

## ✨ Key Features

### 🔐 True End-to-End Encryption (E2EE)

Unlike apps that encrypt messages but still store your files, DriveChat encrypts everything.  
Only encrypted metadata is stored. We know a file exists, but not what it is.

### 🧭 Device Orchestration

See exactly which device (Laptop, Phone, Tablet) sent each message, making it easy to organize your workflow.

### ☁️ Your Files, Your Drive

Files are uploaded directly to your personal Google Drive (DriveChat/ folder).  
You retain full ownership at all times.

### ⚡ Real-Time Sync

Built with Socket.IO and Redis Streams.  
Send from one device and it appears instantly on all others.

### 🕒 Ephemeral by Default

Messages auto-delete after 24 hours.  
Star important content to keep it forever—let the rest fade away.

---

## 🏗️ How It Works

The architecture is designed to keep the server out of the way as much as possible.

### 🔑 Authentication

- Sign in via Clerk (Google OAuth)
- No phone numbers required

### 🔐 Encryption Model

- You enter a passphrase on each device
- A Master Encryption Key (MEK) is derived locally using scrypt
- The MEK never leaves your device

⚠️ The Math Doesn’t Lie  
If you enter the wrong passphrase, decryption fails.  
If you lose your passphrase, your messages are gone forever.  
To reset, you must delete your account and recreate it.  
Your files remain safe in Drive, but old messages become inaccessible.

### 💬 Messaging Flow

You type a message → frontend encrypts it → backend receives ciphertext → Firestore stores encrypted data → realtime layer pushes ciphertext → other devices decrypt locally using their MEK.

### 📁 File Flow

You upload a file → frontend encrypts file metadata → frontend uploads directly to Google Drive → backend stores only the encrypted file ID.

---

## 🚀 Quick Start

The recommended way to run DriveChat is locally using Node.js and a Redis container.

1. Clone the repository  
   git clone https://github.com/your-username/drivechat.git  
   cd drivechat

2. Configure environment variables  
   cp backend/.env.example backend/.env  
   cp frontend/.env.example frontend/.env

3. Start Redis  
   docker run -d -p 6379:6379 redis:7-alpine

4. Install dependencies  
   npm install in frontend/backend

5. Run the application  
   npm start

Visit http://localhost:5173 to get started.

Note:  
If you prefer a fully containerized setup using Docker Compose, refer to Docs/docker-commands.txt.

---

## 🛠️ Tech Stack

### Frontend

- React 19 + Vite – Fast, modern UI development
- Tailwind CSS – Utility-first styling
- Dexie – IndexedDB caching for offline support
- Socket.IO Client – Real-time connections
- Web Crypto API – Native browser encryption

### Backend

- Node.js + Express 5 – Minimal API surface
- Socket.IO Server – Rooms and event management
- Redis Streams – Durable event replay for offline devices
- BullMQ – Scheduled cleanup and deletion jobs
- Firestore – Canonical encrypted metadata store

---

## 📂 Project Structure

drivechat/  
├── backend/ Express API, Socket.IO server, queue workers  
│ ├── src/  
│ │ ├── realtime/ Socket.IO logic and stream publishers  
│ │ ├── queues/ BullMQ cleanup jobs  
│ │ └── controllers/  
├── frontend/ React application

---

## 🤝 Contributing

This started as a personal tool, but contributions are welcome—especially around security, privacy, and user experience.

- Fork the repository
- Create your feature branch
- Commit using Conventional Commits
- Push your branch
- Open a Pull Request

---
